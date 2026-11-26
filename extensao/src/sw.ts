// Service worker da extensão. Guarda a sessão própria (chrome.storage.local), fala com o Supabase
// usando só a chave anon e o login do dono (as regras de RLS do banco valem igual ao site) e repassa
// o texto pronto para a aba do WhatsApp. Nada aqui lê conversa nem manda conversa a servidor.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AMBIENTE, BASE_LOJA, SUPABASE_ANON, SUPABASE_URL } from "./config.ts";
import { buscarProdutos, esquecerVitrine } from "./busca.ts";
import type { Pedido, PedidoAba, Resposta, Sessao } from "./mensagens.ts";
import { mensagemDeFalha, type ResultadoInsercao } from "./inserir.ts";

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
      return { ok: true, dados: null };
    case "buscar":
      return buscarProdutos(supabase, String(p.termo ?? ""), BASE_LOJA);
    case "inserir":
      return inserir(String(p.texto ?? "").slice(0, 4000), remetente);
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
