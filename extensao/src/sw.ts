// Service worker da extensão. Guarda a sessão própria (chrome.storage.local), fala com o Supabase
// usando só a chave anon e o login do dono (as regras de RLS do banco valem igual ao site) e repassa
// o texto pronto ou o arquivo escolhido (foto, PDF, áudio) para a aba do WhatsApp, que só abre a
// prévia de anexo. Nada aqui lê conversa nem manda conversa a servidor.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AMBIENTE, BASE_LOJA, SUPABASE_ANON, SUPABASE_URL } from "./config.ts";
import { buscarProdutos, esquecerVitrine, listarProdutos, produtosComFoto } from "./busca.ts";
import { dadosDaConta } from "./conta-db.ts";
import { carregarRespostas, esquecerLinkDaVitrine } from "./respostas-db.ts";
import { carregarDadosDaVenda, enviarVenda, validarVendaRapida } from "./venda.ts";
import type { Pedido, PedidoAba, Resposta, ResultadoAnexar, Sessao } from "./mensagens.ts";
import { mensagemDeFalha, type ResultadoInsercao } from "./inserir.ts";
import { mensagemDeFalhaAnexo, type ResultadoAnexo } from "./anexar.ts";
import {
  apagarMidia,
  arquivoDaFoto,
  arquivoDaMidia,
  fotosDoProduto,
  ligarMidia,
  listarMidias,
  renomearMidia,
  salvarGravacao,
  salvarMidia,
  subirMidia,
  urlDaMidia,
} from "./midias-db.ts";
import {
  apagarPasso,
  apagarResposta,
  apagarSequencia,
  reordenarPassos,
  reordenarRespostas,
  reordenarSequencias,
  salvarPasso,
  salvarResposta,
  salvarSequencia,
} from "./gestao-db.ts";
import { mensagemDeFalhaVoz, type Conversa, type RespostaPagina } from "./voz.ts";
import type { ArquivoAnexo } from "./base64.ts";

const armazenamento = {
  getItem: async (k: string) => ((await chrome.storage.local.get(k))[k] as string | undefined) ?? null,
  setItem: async (k: string, v: string) => chrome.storage.local.set({ [k]: v }),
  removeItem: async (k: string) => chrome.storage.local.remove(k),
};

const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    storage: armazenamento,
    persistSession: true,
    autoRefreshToken: true, // e, se o service worker dormiu, getSession renova o token vencido
    detectSessionInUrl: false,
    flowType: "pkce",
  },
});

const ORIGEM = chrome.runtime.getURL("").replace(/\/$/, "");
const WHATSAPP = "https://web.whatsapp.com/";
const CHAVE_FLUXO = "marcon_fluxo_google"; // marca de "login com Google em andamento", vale 10 min

// Painel no lado da janela quando o navegador tem a API; senão o clique no ícone abre o painel
// embutido na própria aba do WhatsApp (conteudo.ts).
const temPainelLateral = typeof chrome.sidePanel?.setPanelBehavior === "function";
if (temPainelLateral) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
} else {
  chrome.action.onClicked.addListener(async (aba) => {
    if (aba.id && aba.url?.startsWith(WHATSAPP)) {
      chrome.tabs.sendMessage(aba.id, { tipo: "alternarPainel" } satisfies PedidoAba, { frameId: 0 }).catch(() => {});
    } else {
      chrome.tabs.create({ url: WHATSAPP });
    }
  });
}

// ---------------------------------------------------------------------------------------------
// Sessão

async function sessaoAtual(): Promise<Sessao | null> {
  const { data } = await supabase.auth.getSession();
  const email = data.session?.user.email;
  return email ? { email, ambiente: AMBIENTE } : null;
}

function traduzirErro(msg: string | undefined): string {
  const m = (msg ?? "").toLowerCase();
  if (m.includes("invalid login")) return "E-mail ou senha não conferem.";
  if (m.includes("email not confirmed")) return "Confirme o e-mail antes de entrar.";
  if (m.includes("rate") || m.includes("too many")) return "Muitas tentativas. Espere um pouco e tente de novo.";
  if (m.includes("fetch") || m.includes("network")) return "Sem conexão com o Marcon. Confira a internet.";
  return "Não deu para entrar. Tente de novo.";
}

async function entrar(email: string, senha: string): Promise<Resposta<Sessao>> {
  esquecerVitrine();
  esquecerLinkDaVitrine();
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
  if (error) return { ok: false, erro: traduzirErro(error.message) };
  const s = await sessaoAtual();
  return s ? { ok: true, dados: s } : { ok: false, erro: "Não deu para entrar. Tente de novo." };
}

async function trocarCodigo(code: string): Promise<Resposta<Sessao>> {
  // Só troca código de um login que esta extensão começou (o verificador PKCE também só existe aqui).
  const marca = (await chrome.storage.local.get(CHAVE_FLUXO))[CHAVE_FLUXO] as number | undefined;
  await chrome.storage.local.remove(CHAVE_FLUXO);
  if (!marca || Date.now() - marca > 10 * 60 * 1000) return { ok: false, erro: "Login expirou. Tente de novo." };
  esquecerVitrine();
  esquecerLinkDaVitrine();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return { ok: false, erro: traduzirErro(error.message) };
  const s = await sessaoAtual();
  return s ? { ok: true, dados: s } : { ok: false, erro: "Não deu para entrar. Tente de novo." };
}

async function urlDoGoogle(redirectTo: string): Promise<string | null> {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo, skipBrowserRedirect: true },
  });
  return error || !data.url ? null : data.url;
}

// Google: primeiro pela janela própria do navegador (chrome.identity.launchWebAuthFlow). Se o
// navegador não tiver a API, abre o login numa aba e a página retorno.html devolve o código.
async function entrarGoogle(): Promise<Resposta<Sessao | "aba">> {
  await chrome.storage.local.set({ [CHAVE_FLUXO]: Date.now() });

  if (typeof chrome.identity?.launchWebAuthFlow === "function") {
    const url = await urlDoGoogle(chrome.identity.getRedirectURL("google"));
    if (!url) return { ok: false, erro: "Login com Google indisponível agora." };
    let volta: string | undefined;
    try {
      volta = await chrome.identity.launchWebAuthFlow({ url, interactive: true });
    } catch (e) {
      const m = String((e as Error)?.message ?? e).toLowerCase();
      if (m.includes("did not approve") || m.includes("cancel") || m.includes("closed")) {
        await chrome.storage.local.remove(CHAVE_FLUXO);
        return { ok: false, erro: "Login com Google cancelado." };
      }
      return entrarGooglePorAba();
    }
    const params = new URL(volta ?? "about:blank").searchParams;
    const code = params.get("code");
    if (!code) {
      await chrome.storage.local.remove(CHAVE_FLUXO);
      return { ok: false, erro: params.get("error_description") ? "O Google recusou o login." : "Login com Google cancelado." };
    }
    return trocarCodigo(code);
  }
  return entrarGooglePorAba();
}

async function entrarGooglePorAba(): Promise<Resposta<"aba">> {
  const url = await urlDoGoogle(chrome.runtime.getURL("retorno.html"));
  if (!url) return { ok: false, erro: "Login com Google indisponível agora." };
  await chrome.tabs.create({ url });
  return { ok: true, dados: "aba" };
}

// ---------------------------------------------------------------------------------------------
// Inserir na aba do WhatsApp

async function abaDoWhatsApp(remetente: chrome.runtime.MessageSender): Promise<number | null> {
  if (remetente.tab?.id && remetente.tab.url?.startsWith(WHATSAPP)) return remetente.tab.id; // painel embutido
  const naJanela = await chrome.tabs.query({ url: `${WHATSAPP}*`, active: true, lastFocusedWindow: true });
  if (naJanela[0]?.id) return naJanela[0].id;
  const qualquer = await chrome.tabs.query({ url: `${WHATSAPP}*`, lastFocusedWindow: true });
  return qualquer[0]?.id ?? null;
}

// Arquivo na prévia de anexo do WhatsApp. Quem envia é o dono, na própria prévia.
async function anexar(arquivo: Resposta<ArquivoAnexo>, remetente: chrome.runtime.MessageSender): Promise<Resposta<ResultadoAnexar>> {
  if (!arquivo.ok) return arquivo;
  const aba = await abaDoWhatsApp(remetente);
  if (!aba) return { ok: true, dados: { anexou: false, mensagem: mensagemDeFalhaAnexo("sem-aba"), arquivo: arquivo.dados } };
  try {
    const r = (await chrome.tabs.sendMessage(aba, { tipo: "anexar", arquivo: arquivo.dados } satisfies PedidoAba, { frameId: 0 })) as ResultadoAnexo;
    if (r?.ok) {
      await chrome.tabs.update(aba, { active: true });
      return { ok: true, dados: { anexou: true, mensagem: "Arquivo na prévia do WhatsApp. Confira e envie." } };
    }
    return { ok: true, dados: { anexou: false, mensagem: mensagemDeFalhaAnexo(r?.motivo ?? "nao-abriu"), arquivo: arquivo.dados } };
  } catch {
    return { ok: true, dados: { anexou: false, mensagem: "Recarregue a aba do WhatsApp (F5) e tente de novo.", arquivo: arquivo.dados } };
  }
}

// Áudio de voz: primeiro o nome da conversa aberta (o painel pede confirmação com ele), depois UM
// envio, só se a conversa ainda é a confirmada. Quem manda é o clique do dono no painel.
async function conversaAberta(remetente: chrome.runtime.MessageSender): Promise<Resposta<Conversa & { rascunho: boolean }>> {
  const aba = await abaDoWhatsApp(remetente);
  if (!aba) return { ok: false, erro: mensagemDeFalhaVoz("sem-aba") };
  try {
    const r = (await chrome.tabs.sendMessage(aba, { tipo: "conversa" } satisfies PedidoAba, { frameId: 0 })) as RespostaPagina;
    if (!r?.ok) return { ok: false, erro: mensagemDeFalhaVoz(r?.motivo ?? "sem-resposta") };
    if (!r.conversa) return { ok: false, erro: mensagemDeFalhaVoz("sem-conversa") };
    const caixa = (await chrome.tabs.sendMessage(aba, { tipo: "caixaTemTexto" } satisfies PedidoAba, { frameId: 0 }).catch(() => null)) as { temTexto?: boolean } | null;
    return { ok: true, dados: { ...r.conversa, rascunho: caixa?.temTexto === true } };
  } catch {
    return { ok: false, erro: "Recarregue a aba do WhatsApp (F5) e tente de novo." };
  }
}

const LIMITE_VOZ_BASE64 = 8 * 1024 * 1024;
async function enviarVoz(conversa: string, base64: string, remetente: chrome.runtime.MessageSender): Promise<Resposta<string>> {
  if (!conversa || !base64 || base64.length > LIMITE_VOZ_BASE64) return { ok: false, erro: mensagemDeFalhaVoz("audio-invalido") };
  const aba = await abaDoWhatsApp(remetente);
  if (!aba) return { ok: false, erro: mensagemDeFalhaVoz("sem-aba") };
  try {
    const r = (await chrome.tabs.sendMessage(aba, { tipo: "enviarVoz", conversa, base64 } satisfies PedidoAba, { frameId: 0 })) as RespostaPagina;
    if (!r?.ok) return { ok: false, erro: mensagemDeFalhaVoz(r?.motivo ?? "sem-resposta") };
    return { ok: true, dados: "Áudio de voz enviado." };
  } catch {
    return { ok: false, erro: mensagemDeFalhaVoz("sem-resposta") };
  }
}

async function inserir(texto: string, remetente: chrome.runtime.MessageSender): Promise<Resposta<string>> {
  const aba = await abaDoWhatsApp(remetente);
  if (!aba) return { ok: false, erro: mensagemDeFalha("sem-aba") };
  try {
    const r = (await chrome.tabs.sendMessage(aba, { tipo: "inserir", texto } satisfies PedidoAba, { frameId: 0 })) as ResultadoInsercao;
    if (r?.ok) {
      await chrome.tabs.update(aba, { active: true });
      return { ok: true, dados: "Texto na caixa. Revise e envie." };
    }
    return { ok: false, erro: mensagemDeFalha(r?.motivo ?? "nao-entrou") };
  } catch {
    return { ok: false, erro: "Recarregue a aba do WhatsApp (F5) e tente de novo." };
  }
}

// ---------------------------------------------------------------------------------------------

async function atender(p: Pedido, remetente: chrome.runtime.MessageSender): Promise<Resposta> {
  switch (p.tipo) {
    case "sessao": {
      const s = await sessaoAtual();
      return { ok: true, dados: s };
    }
    case "entrar":
      return entrar(String(p.email ?? ""), String(p.senha ?? ""));
    case "entrarGoogle":
      return entrarGoogle();
    case "trocarCodigo":
      return trocarCodigo(String(p.code ?? ""));
    case "sair":
      // scope local: sai só da extensão, sem derrubar o login do site no computador e no celular.
      await supabase.auth.signOut({ scope: "local" });
      esquecerVitrine();
      esquecerLinkDaVitrine();
      return { ok: true, dados: null };
    case "buscar":
      return buscarProdutos(supabase, String(p.termo ?? ""), BASE_LOJA);
    case "respostas":
      return carregarRespostas(supabase, BASE_LOJA);
    case "dadosVenda":
      return carregarDadosDaVenda(supabase);
    case "vender": {
      // confere aqui também, para nunca mandar ao servidor algo fora do formato
      const v = validarVendaRapida(p.venda);
      if (!v.ok) return { ok: false, erro: v.erro };
      return enviarVenda(supabase, BASE_LOJA, v.dados);
    }
    case "inserir":
      return inserir(String(p.texto ?? "").slice(0, 4000), remetente);
    case "fotosProduto":
      return fotosDoProduto(supabase, String(p.produtoId ?? ""));
    case "anexarFoto":
      return anexar(await arquivoDaFoto(supabase, String(p.path ?? ""), String(p.nome ?? "foto")), remetente);
    case "midias":
      return listarMidias(supabase);
    case "anexarMidia":
      return anexar(await arquivoDaMidia(supabase, String(p.id ?? "")), remetente);
    case "urlMidia":
      return urlDaMidia(supabase, String(p.id ?? ""));
    case "arquivoMidia":
      return arquivoDaMidia(supabase, String(p.id ?? ""));
    case "conversaAberta":
      return conversaAberta(remetente);
    case "enviarVoz":
      return enviarVoz(String(p.conversa ?? ""), String(p.base64 ?? ""), remetente);
    case "conta":
      return dadosDaConta(supabase);
    case "listarProdutos":
      return listarProdutos(supabase, Number(p.pagina) || 0, BASE_LOJA);
    case "renomearMidia":
      return renomearMidia(supabase, String(p.id ?? ""), String(p.titulo ?? ""));
    case "produtosComFoto":
      return produtosComFoto(supabase, String(p.termo ?? ""), BASE_LOJA);
    case "salvarGravacao":
      return salvarGravacao(supabase, {
        base64: String(p.base64 ?? ""),
        ext: String(p.ext ?? ""),
        titulo: String(p.titulo ?? ""),
        duracao: Number(p.duracao) || 0,
      });
    case "salvarResposta":
      return salvarResposta(supabase, { id: p.id || undefined, titulo: String(p.titulo ?? ""), texto: String(p.texto ?? ""), atalho: String(p.atalho ?? "") });
    case "apagarResposta":
      return apagarResposta(supabase, String(p.id ?? ""));
    case "reordenarRespostas":
      return reordenarRespostas(supabase, p.ids);
    case "subirMidia":
      return subirMidia(supabase, {
        base64: String(p.base64 ?? ""),
        nome: String(p.nome ?? ""),
        mime: String(p.mime ?? ""),
        duracao: p.duracao == null ? null : Number(p.duracao),
      });
    case "salvarMidia":
      return salvarMidia(supabase, String(p.id ?? ""), String(p.titulo ?? ""), p.respostaId ? String(p.respostaId) : null);
    case "ligarMidia":
      return ligarMidia(supabase, String(p.id ?? ""), p.respostaId ? String(p.respostaId) : null);
    case "apagarMidia":
      return apagarMidia(supabase, String(p.id ?? ""));
    case "salvarSequencia":
      return salvarSequencia(supabase, { id: p.id || undefined, titulo: String(p.titulo ?? "") });
    case "apagarSequencia":
      return apagarSequencia(supabase, String(p.id ?? ""));
    case "reordenarSequencias":
      return reordenarSequencias(supabase, p.ids);
    case "salvarPasso":
      return salvarPasso(supabase, {
        id: p.id || undefined,
        sequenciaId: String(p.sequenciaId ?? ""),
        fonte: String(p.fonte ?? ""),
        texto: String(p.texto ?? ""),
        respostaId: String(p.respostaId ?? ""),
        midiaId: String(p.midiaId ?? ""),
      });
    case "apagarPasso":
      return apagarPasso(supabase, String(p.id ?? ""));
    case "reordenarPassos":
      return reordenarPassos(supabase, String(p.sequenciaId ?? ""), p.ids);
    case "abrirMicrofone":
      await chrome.tabs.create({ url: chrome.runtime.getURL("microfone.html") });
      return { ok: true, dados: null };
    case "fecharPainel":
      if (remetente.tab?.id) chrome.tabs.sendMessage(remetente.tab.id, { tipo: "alternarPainel" } satisfies PedidoAba, { frameId: 0 }).catch(() => {});
      return { ok: true, dados: null };
    default:
      return { ok: false, erro: "Pedido desconhecido." };
  }
}

chrome.runtime.onMessage.addListener((pedido: Pedido, remetente, responder) => {
  // Só as páginas da própria extensão (painel e retorno) podem pedir. O script que roda dentro do
  // WhatsApp não pede nada ao service worker.
  if (remetente.id !== chrome.runtime.id || !remetente.url?.startsWith(ORIGEM)) return false;
  atender(pedido, remetente)
    .then(responder)
    .catch(() => responder({ ok: false, erro: "Algo deu errado. Tente de novo." } satisfies Resposta));
  return true;
});
