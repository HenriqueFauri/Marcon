// Painel do Marcon (painel lateral do navegador ou embutido no WhatsApp). Tela simples em DOM puro:
// todo texto vindo do banco entra por textContent, nunca como HTML.
import { AMBIENTE, BASE_LOJA } from "./config.ts";
import { estoqueTotal, formatarMensagem, formatarPreco, type ProdutoBusca } from "./formatar.ts";
import { pedir, type Pedido, type ResultadoAnexar, type Sessao } from "./mensagens.ts";
import { filtrarRespostas, preencherVariaveis } from "./respostas.ts";
import type { RespostasDaConta } from "./respostas-db.ts";
import {
  assinaturaDaVenda,
  canalPadrao,
  filtrarClientes,
  lerPreco,
  MAX_QUANTIDADE,
  semAcento,
  soDigitos,
  totalDaVenda,
  type ClienteBusca,
  type DadosDaVenda,
  type ItemVendaRapida,
  type Opcao,
  type RespostaVenda,
  type VendaFeita,
  type VendaRapida,
} from "./venda.ts";
import { deBase64, paraBase64, type ArquivoAnexo } from "./base64.ts";
import { ROTULO_TIPO, detalheDaMidia, filtrarMidias, formatarDuracao, LIMITE_GRAVACAO_SEG, formatoDeGravacao } from "./midias.ts";
import type { FotoProduto, MidiaPainel } from "./midias-db.ts";
import type { ProdutoComFoto } from "./busca.ts";
import { codificaOpus, paraOggOpus } from "./ogg-opus.ts";
import {
  INICIO,
  acaoAtual,
  depoisDaAcao,
  montarRoteiro,
  pular,
  rotuloDaAcao,
  rotuloProgresso,
  terminou,
  voltar,
  type Acao,
  type Posicao,
  type Roteiro,
} from "./sequencias.ts";

const app = document.getElementById("app")!;
const embutido = new URLSearchParams(location.search).get("modo") === "embutido";

type Filho = Node | string | null | undefined | false;
function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: { [atributo: string]: string | Record<string, (e: Event) => unknown> | undefined } = {},
  ...filhos: Filho[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined) continue;
    if (k === "on" && typeof v === "object") for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
    else if (k === "class") el.className = String(v);
    else el.setAttribute(k, String(v));
  }
  for (const f of filhos) if (f) el.append(f);
  return el;
}

function grupo(titulo: string | null, conteudo: Node, rodape?: string) {
  return h(
    "section",
    { class: "grupo" },
    titulo ? h("h2", { class: "grupo-titulo" }, titulo) : null,
    h("div", { class: "cartao" }, conteudo),
    rodape ? h("p", { class: "grupo-rodape" }, rodape) : null,
  );
}

function topo() {
  return h(
    "header",
    { class: "topo" },
    h("img", { src: "icones/icone-48.png", alt: "" }),
    h("h1", {}, "Marcon"),
    AMBIENTE === "staging" ? h("span", { class: "selo" }, "Staging") : null,
    embutido
      ? h("button", { class: "fechar", type: "button", "aria-label": "Fechar painel", on: { click: () => pedir({ tipo: "fecharPainel" }) } }, "×")
      : null,
  );
}

// Aviso que some sozinho (barra escura no pé do painel).
let avisoEl: HTMLDivElement | null = null;
let avisoTimer: number | undefined;
function avisar(texto: string, erro = false, acao?: { rotulo: string; fazer: () => void }) {
  if (!avisoEl) return;
  avisoEl.replaceChildren(h("span", {}, texto));
  if (acao) {
    const botao = h("button", { class: "btn-pequeno neutro aviso-acao", type: "button" }, acao.rotulo);
    botao.addEventListener("click", () => {
      acao.fazer();
      if (avisoEl) avisoEl.hidden = true;
    });
    avisoEl.append(botao);
  }
  avisoEl.className = erro ? "aviso erro" : "aviso";
  avisoEl.hidden = false;
  clearTimeout(avisoTimer);
  avisoTimer = window.setTimeout(() => avisoEl && (avisoEl.hidden = true), acao ? 12000 : erro ? 6000 : 3000);
}

// Plano B do Anexar: salva o arquivo no computador para o dono arrastar para a conversa
function baixarArquivo(a: ArquivoAnexo) {
  const url = URL.createObjectURL(new Blob([deBase64(a.base64)], { type: a.mime }));
  const link = h("a", { href: url, download: a.nome });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

// Anexar: o arquivo vai para a prévia de anexo do WhatsApp. Quem envia é o dono, na prévia.
async function anexarComBotao(p: Pedido, botao: HTMLButtonElement, aoPerderSessao?: (erro: string) => void) {
  if (botao.disabled) return;
  // botão de texto mostra "Anexando..."; miniatura de foto só escurece (classe ocupado)
  const antes = [...botao.childNodes];
  const deTexto = botao.children.length === 0;
  botao.disabled = true;
  if (deTexto) botao.textContent = "Anexando...";
  else botao.classList.add("ocupado");
  const r = await pedir<ResultadoAnexar>(p);
  botao.disabled = false;
  botao.classList.remove("ocupado");
  if (deTexto) botao.replaceChildren(...antes);
  if (!r.ok) {
    if (r.erro.includes("sessão") && aoPerderSessao) return aoPerderSessao(r.erro);
    return avisar(r.erro, true);
  }
  if (r.dados.anexou) return avisar(r.dados.mensagem);
  const arquivo = r.dados.arquivo;
  avisar(r.dados.mensagem, true, arquivo ? { rotulo: "Baixar", fazer: () => baixarArquivo(arquivo) } : undefined);
}

// ---------------------------------------------------------------------------------------------
// Áudio de voz: converte para OGG/Opus aqui, pergunta qual conversa está aberta no WhatsApp, mostra o
// nome para o dono confirmar e só então manda UM áudio de voz nela. Sem prévia: o clique em Enviar
// da confirmação é o envio. Um por vez (os botões ficam travados até voltar).

let vozOcupada = false;

// Confirmação por cima do painel com o nome da conversa. true só no clique em Enviar.
function confirmarEnvio(nome: string, titulo: string, rascunho: boolean): Promise<boolean> {
  return new Promise((resolve) => {
    const fundo = h("div", { class: "confirmar-fundo" });
    // o nome da conversa aberta fica no próprio botão: o clique manda para quem está escrito nele
    const enviar = h("button", { class: "btn btn-principal botao-para", type: "button" }, `Enviar para ${nome.length > 40 ? `${nome.slice(0, 39)}…` : nome}`);
    const cancelar = h("button", { class: "btn btn-secundario", type: "button" }, "Cancelar");
    const fechar = (ok: boolean) => {
      fundo.remove();
      document.removeEventListener("keydown", tecla);
      resolve(ok);
    };
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && fechar(false);
    enviar.addEventListener("click", () => fechar(true));
    cancelar.addEventListener("click", () => fechar(false));
    fundo.append(
      h(
        "div",
        { class: "confirmar", role: "dialog", "aria-modal": "true", "aria-label": "Confirmar envio do áudio de voz" },
        h("strong", {}, "Enviar áudio de voz?"),
        h("span", { class: "detalhe" }, titulo),
        h("span", { class: "confirmar-para" }, "Para: ", h("b", {}, nome)),
        h("span", { class: "detalhe" }, "Vai direto para a conversa, como mensagem de voz."),
        rascunho ? h("span", { class: "confirmar-aviso" }, "Tem texto na caixa de mensagem que ainda não saiu. Se enviar agora, o áudio chega antes dele.") : null,
        enviar,
        cancelar,
      ),
    );
    document.body.append(fundo);
    document.addEventListener("keydown", tecla);
    cancelar.focus();
  });
}

async function enviarAudioDeVoz(
  titulo: string,
  obterBytes: () => Promise<ArrayBuffer | string>,
  botao: HTMLButtonElement,
  aoPerderSessao?: (erro: string) => void,
): Promise<boolean> {
  if (vozOcupada) {
    avisar("Termine o áudio anterior primeiro.", true);
    return false;
  }
  if (!codificaOpus()) {
    avisar("Este navegador não converte áudio para mensagem de voz. Use o Brave ou o Chrome atualizado.", true);
    return false;
  }
  vozOcupada = true;
  const rotulo = botao.textContent;
  botao.disabled = true;
  const voltar = () => {
    vozOcupada = false;
    botao.disabled = false;
    botao.textContent = rotulo;
  };
  try {
    botao.textContent = "Preparando...";
    const bytes = await obterBytes();
    if (typeof bytes === "string") {
      if (bytes.includes("sessão") && aoPerderSessao) aoPerderSessao(bytes);
      else avisar(bytes, true);
      return false;
    }
    let ogg: Uint8Array;
    try {
      ogg = (await paraOggOpus(bytes)).ogg;
    } catch (e) {
      avisar((e as Error)?.message === "longo" ? "Áudio longo demais para mensagem de voz (até 15 minutos)." : "Não deu para converter esse áudio para mensagem de voz.", true);
      return false;
    }
    const c = await pedir<{ id: string; nome: string; rascunho?: boolean }>({ tipo: "conversaAberta" });
    if (!c.ok) {
      avisar(c.erro, true);
      return false;
    }
    botao.textContent = "Confirme...";
    if (!(await confirmarEnvio(c.dados.nome, titulo, c.dados.rascunho === true))) return false;
    botao.textContent = "Enviando...";
    const r = await pedir<string>({ tipo: "enviarVoz", conversa: c.dados.id, base64: paraBase64(ogg) });
    if (!r.ok) {
      avisar(r.erro, true);
      return false;
    }
    avisar(`Áudio de voz enviado para ${c.dados.nome}.`);
    return true;
  } finally {
    voltar();
  }
}

// bytes de um áudio da biblioteca (ou a mensagem de erro)
async function bytesDaMidia(id: string): Promise<ArrayBuffer | string> {
  const r = await pedir<ArquivoAnexo>({ tipo: "arquivoMidia", id });
  return r.ok ? deBase64(r.dados.base64).buffer : r.erro;
}

async function copiar(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    const t = h("textarea", {});
    t.value = texto;
    t.style.cssText = "position:fixed;opacity:0";
    document.body.append(t);
    t.select();
    const ok = document.execCommand("copy");
    t.remove();
    return ok;
  }
}

// ---------------------------------------------------------------------------------------------
// Entrar

function telaEntrar(erroInicial?: string) {
  const email = h("input", { class: "campo", type: "email", placeholder: "E-mail", autocomplete: "username", "aria-label": "E-mail" });
  const senha = h("input", { class: "campo", type: "password", placeholder: "Senha", autocomplete: "current-password", "aria-label": "Senha" });
  const erro = h("p", { class: "erro-campo", role: "alert" }, erroInicial ?? "");
  const botao = h("button", { class: "btn btn-principal", type: "submit" }, "Entrar");
  const google = h(
    "button",
    {
      class: "btn btn-secundario",
      type: "button",
      on: {
        click: async () => {
          google.disabled = true;
          erro.textContent = "";
          const r = await pedir<Sessao | "aba">({ tipo: "entrarGoogle" });
          google.disabled = false;
          if (!r.ok) erro.textContent = r.erro;
          else if (r.dados === "aba") erro.textContent = "Termine o login na aba que abriu. Depois volte aqui.";
          else telaPrincipal(r.dados);
        },
      },
    },
    "Entrar com Google",
  );

  const form = h(
    "form",
    {
      class: "grupo",
      on: {
        submit: async (e) => {
          e.preventDefault();
          if (!email.value.trim() || !senha.value) {
            erro.textContent = "Preencha e-mail e senha.";
            return;
          }
          botao.disabled = true;
          botao.textContent = "Entrando...";
          erro.textContent = "";
          const r = await pedir<Sessao>({ tipo: "entrar", email: email.value, senha: senha.value });
          senha.value = "";
          botao.disabled = false;
          botao.textContent = "Entrar";
          if (r.ok) telaPrincipal(r.dados);
          else erro.textContent = r.erro;
        },
      },
    },
    h("h2", { class: "grupo-titulo" }, "Sua conta do Marcon"),
    h("div", { class: "cartao" }, email, senha),
    erro,
    h("div", { style: "padding-top:10px" }, botao),
  );

  app.replaceChildren(topo(), form, h("div", { class: "grupo" }, h("p", { class: "ou" }, "ou"), google));
  email.focus();
}

// ---------------------------------------------------------------------------------------------
// Busca e resultados

function capa(p: ProdutoBusca) {
  if (p.capa) return h("img", { class: "capa", src: p.capa, alt: "", loading: "lazy" });
  return h("div", { class: "capa vazia", "aria-hidden": "true" }, (p.nome.trim()[0] ?? "?").toUpperCase());
}

function rotuloEstoque(qtd: number) {
  if (qtd <= 0) return h("span", { class: "estado-aviso" }, "Zerado");
  return h("span", { class: "estado-positivo" }, qtd === 1 ? "1 em estoque" : `${qtd} em estoque`);
}

function acoes(p: ProdutoBusca, variacaoId?: string) {
  const alvo = variacaoId ? `${p.nome} ${p.variacoes.find((v) => v.id === variacaoId)?.nome ?? ""}`.trim() : p.nome;
  return inserirCopiar(() => formatarMensagem(p, variacaoId), alvo);
}

// Inserir (coloca na caixa do WhatsApp, sem enviar) e Copiar (plano B)
// Texto vazio (resposta em que toda linha usa um dado que a conta não tem): avisa e não insere.
const SEM_TEXTO = "Falta dado na conta para esta resposta. Preencha em Configurações, no Marcon.";

function inserirCopiar(texto: () => string, alvo: string) {
  return h(
    "div",
    { class: "acoes" },
    h(
      "button",
      {
        class: "btn-pequeno destaque",
        type: "button",
        "aria-label": `Inserir ${alvo}`,
        on: {
          click: async () => {
            if (!texto().trim()) return avisar(SEM_TEXTO, true);
            const r = await pedir<string>({ tipo: "inserir", texto: texto() });
            if (r.ok) avisar(r.dados);
            else {
              // Plano B automático: o texto já vai para a área de transferência.
              const copiou = await copiar(texto());
              avisar(copiou ? `${r.erro} Já copiei o texto: clique na caixa e cole.` : r.erro, true);
            }
          },
        },
      },
      "Inserir",
    ),
    h(
      "button",
      {
        class: "btn-pequeno neutro",
        type: "button",
        "aria-label": `Copiar ${alvo}`,
        on: {
          click: async () => {
            if (!texto().trim()) return avisar(SEM_TEXTO, true);
            avisar((await copiar(texto())) ? "Texto copiado." : "Não deu para copiar.", false);
          },
        },
      },
      "Copiar",
    ),
  );
}

// Foto do produto direto do estoque: Anexar foto manda a capa; Fotos abre as outras para escolher.
let perderSessao: (erro: string) => void = () => {};

function fotosDoItem(p: Pick<ProdutoBusca, "id" | "nome" | "capaPath" | "totalFotos">) {
  if (!p.capaPath) return null;
  const total = p.totalFotos ?? 1;
  const grade = h("div", { class: "fotos", hidden: "" });
  let carregou = false;

  const anexarCapa = h("button", { class: "btn-pequeno neutro", type: "button", "aria-label": `Anexar foto de ${p.nome}` }, "Anexar foto");
  anexarCapa.addEventListener("click", () => anexarComBotao({ tipo: "anexarFoto", path: p.capaPath!, nome: p.nome }, anexarCapa, perderSessao));

  const escolher =
    total > 1
      ? h("button", { class: "btn-pequeno neutro", type: "button", "aria-expanded": "false", "aria-label": `Escolher entre ${total} fotos de ${p.nome}` }, `Fotos (${total})`)
      : null;
  escolher?.addEventListener("click", async () => {
    const abrir = grade.hidden;
    grade.hidden = !abrir;
    escolher.setAttribute("aria-expanded", String(abrir));
    if (!abrir || carregou) return;
    grade.replaceChildren(h("p", { class: "detalhe" }, "Carregando..."));
    const r = await pedir<FotoProduto[]>({ tipo: "fotosProduto", produtoId: p.id });
    if (!r.ok) {
      if (r.erro.includes("sessão")) return perderSessao(r.erro);
      grade.replaceChildren(h("p", { class: "erro-campo" }, r.erro));
      return;
    }
    carregou = true;
    grade.replaceChildren(
      ...r.dados.map((f, i) => {
        const rotulo = `Anexar foto ${i + 1} de ${p.nome}${f.variacao ? `, ${f.variacao}` : ""}`;
        const b = h("button", { class: "foto", type: "button", "aria-label": rotulo, title: f.variacao ?? `Foto ${i + 1}` }, h("img", { src: f.url, alt: "", loading: "lazy" }));
        b.addEventListener("click", () => anexarComBotao({ tipo: "anexarFoto", path: f.path, nome: p.nome }, b, perderSessao));
        return b;
      }),
    );
  });

  return h("div", { class: "bloco-fotos" }, h("div", { class: "acoes" }, anexarCapa, escolher), grade);
}

function itemProduto(p: ProdutoBusca) {
  const total = estoqueTotal(p);
  const marcaSku = [p.marca, p.sku].filter(Boolean).join(" · ");
  const vitrine = p.link
    ? "Na vitrine"
    : !p.naVitrine
      ? "Fora da vitrine"
      : p.vitrineConferida === false
        ? "Na vitrine, link indisponível agora"
        : "Na vitrine, loja fora do ar";

  let preco = formatarPreco(p.preco);
  if (p.variacoes.length > 0) {
    const precos = p.variacoes.map((v) => v.preco);
    const menor = Math.min(...precos);
    preco = menor === Math.max(...precos) ? formatarPreco(menor) : `A partir de ${formatarPreco(menor)}`;
  }

  const variacoes =
    p.variacoes.length > 0
      ? h(
          "div",
          { class: "variacoes" },
          ...p.variacoes.map((v) =>
            h(
              "div",
              { class: "variacao" },
              h(
                "div",
                { class: "info" },
                h("span", { class: "nome" }, v.nome),
                h("span", { class: "detalhe" }, `${formatarPreco(v.preco)} · `, rotuloEstoque(v.estoque)),
              ),
              acoes(p, v.id),
            ),
          ),
        )
      : null;

  return h(
    "div",
    { class: "produto" },
    capa(p),
    h(
      "div",
      { class: "info" },
      h("span", { class: "nome" }, p.nome),
      marcaSku ? h("span", { class: "detalhe" }, marcaSku) : null,
      h("span", { class: "preco" }, preco),
      h("span", { class: "detalhe" }, rotuloEstoque(total), ` · ${vitrine}`),
      acoes(p),
      fotosDoItem(p),
      variacoes,
    ),
  );
}

function iconeLupa() {
  const lupa = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  lupa.setAttribute("width", "18");
  lupa.setAttribute("height", "18");
  lupa.setAttribute("viewBox", "0 0 24 24");
  lupa.setAttribute("fill", "none");
  lupa.setAttribute("stroke", "currentColor");
  lupa.setAttribute("stroke-width", "2.2");
  lupa.setAttribute("stroke-linecap", "round");
  lupa.innerHTML = '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>';
  return lupa;
}

// ---------------------------------------------------------------------------------------------
// Sequências (parte 4), no topo da aba Respostas. O dono escolhe uma e avança passo a passo: cada
// clique faz UMA ação (põe o texto na caixa ou abre a prévia do anexo) e só depois que ela deu
// certo o painel aponta para a próxima. Nada de timer, nada anda sozinho, nada é enviado.

// a sequência aberta continua onde estava quando a lista recarrega (voltar ao painel, Atualizar)
let tocando: { seqId: string; pos: Posicao } | null = null;

// "Anexar PDF" vira "anexar PDF" (só a primeira letra)
const minuscula = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);

function blocoSequencias(aoPerderSessao: (erro: string) => void) {
  const el = h("div", { class: "grupo" });
  let conta: RespostasDaConta | null = null;
  let ocupado = false;

  function roteiroDe(seqId: string): Roteiro | null {
    const seq = conta?.sequencias?.find((s) => s.id === seqId);
    if (!seq || !conta) return null;
    const dados = conta.dados;
    const respostas = conta.respostas.map((r) => ({ id: r.id, titulo: r.titulo, texto: r.texto }));
    return montarRoteiro(seq, conta.passos ?? [], respostas, conta.arquivos ?? [], (t) => preencherVariaveis(t, dados));
  }

  // faz a ação do clique; devolve true se o texto entrou (ou foi copiado para o dono colar) ou a prévia abriu
  async function fazer(a: Acao, botao: HTMLButtonElement): Promise<boolean> {
    if (a.tipo === "texto") {
      const r = await pedir<string>({ tipo: "inserir", texto: a.texto });
      if (r.ok) {
        avisar(r.dados);
        return true;
      }
      if (r.erro.includes("sessão")) {
        aoPerderSessao(r.erro);
        return false;
      }
      // copiou: o dono cola com a própria mão e o painel já aponta para a ação seguinte do passo
      const copiou = await copiar(a.texto);
      avisar(copiou ? `${r.erro} Já copiei o texto: clique na caixa e cole.` : r.erro, true);
      return copiou;
    }
    // áudio: mensagem de voz direto na conversa, depois da confirmação com o nome dela
    if (a.midia.tipo === "audio") return enviarAudioDeVoz(a.midia.titulo, () => bytesDaMidia(a.midia.id), botao, aoPerderSessao);
    botao.textContent = "Anexando...";
    const r = await pedir<ResultadoAnexar>({ tipo: "anexarMidia", id: a.midia.id });
    if (!r.ok) {
      if (r.erro.includes("sessão")) aoPerderSessao(r.erro);
      else avisar(r.erro, true);
      return false;
    }
    if (r.dados.anexou) {
      avisar(r.dados.mensagem);
      return true;
    }
    const arquivo = r.dados.arquivo;
    avisar(r.dados.mensagem, true, arquivo ? { rotulo: "Baixar", fazer: () => baixarArquivo(arquivo) } : undefined);
    return false;
  }

  function lista() {
    const seqs = conta?.sequencias ?? [];
    if (seqs.length === 0) return el.replaceChildren();
    const linhas = seqs.map((s) => {
      const r = roteiroDe(s.id);
      const n = r?.passos.length ?? 0;
      const comecar = h("button", { class: "btn-pequeno neutro", type: "button", "aria-label": `Começar ${s.titulo}` }, "Começar");
      if (n === 0) comecar.disabled = true;
      comecar.addEventListener("click", () => {
        tocando = { seqId: s.id, pos: INICIO };
        desenhar();
      });
      return h(
        "div",
        { class: "linha-seq" },
        h("div", { class: "info" }, h("span", { class: "nome" }, s.titulo), h("span", { class: "detalhe" }, n === 0 ? "Sem passos" : n === 1 ? "1 passo" : `${n} passos`)),
        comecar,
      );
    });
    el.replaceChildren(
      h("h2", { class: "grupo-titulo" }, seqs.length === 1 ? "1 sequência" : `${seqs.length} sequências`),
      h("div", { class: "cartao" }, ...linhas),
    );
  }

  function tocador(r: Roteiro, pos: Posicao) {
    const fim = terminou(r, pos);
    const acao = acaoAtual(r, pos);
    const passo = r.passos[pos.passo];
    const fechar = h("button", { class: "btn-pequeno neutro", type: "button" }, "Fechar");
    fechar.addEventListener("click", () => {
      tocando = null;
      desenhar();
    });
    const voltarB = h("button", { class: "btn-pequeno neutro", type: "button" }, "Voltar");
    voltarB.addEventListener("click", () => mover(voltar(r, pos)));
    if (pos.passo === 0 && pos.acao === 0) voltarB.disabled = true;

    let corpo: Node[];
    if (fim || !acao || !passo) {
      const recomecar = h("button", { class: "btn btn-principal", type: "button" }, "Recomeçar");
      recomecar.addEventListener("click", () => mover(INICIO));
      corpo = [h("div", { class: "vazio" }, h("strong", {}, "Fim da sequência"), "Tudo já foi para a caixa ou para a prévia."), h("div", { class: "acoes-seq" }, recomecar), h("div", { class: "acoes" }, voltarB, fechar)];
    } else {
      const principal = h("button", { class: "btn btn-principal", type: "button" }, rotuloDaAcao(acao));
      principal.addEventListener("click", async () => {
        // um clique, uma ação: botão travado até a ação voltar (clique duplo não insere duas vezes)
        if (ocupado || !tocando) return;
        ocupado = true;
        principal.disabled = true;
        const deu = await fazer(acao, principal);
        ocupado = false;
        // a lista pode ter recarregado durante o clique: avança sobre o roteiro de agora
        const atual = deu && tocando ? roteiroDe(tocando.seqId) : null;
        if (atual && tocando) mover(depoisDaAcao(atual, tocando.pos));
        else desenhar();
      });
      const pularB = h("button", { class: "btn-pequeno neutro", type: "button" }, "Pular");
      pularB.addEventListener("click", () => mover(pular(r, pos)));
      const proxima = passo.acoes[pos.acao + 1];
      const conteudo =
        acao.tipo === "texto"
          ? h("span", { class: "texto-passo" }, acao.texto)
          : h("span", { class: "nome" }, `${ROTULO_TIPO[acao.midia.tipo]}: ${acao.midia.titulo}`);
      corpo = [
        h(
          "div",
          { class: "passo-atual" },
          passo.titulo ? h("span", { class: "nome" }, passo.titulo) : null,
          conteudo,
          proxima ? h("span", { class: "detalhe" }, `Depois: ${minuscula(rotuloDaAcao(proxima))}`) : null,
        ),
        h("div", { class: "acoes-seq" }, principal),
        h("div", { class: "acoes" }, voltarB, pularB, fechar),
      ];
    }
    const rodape = r.pulados > 0
      ? `${r.pulados === 1 ? "1 passo vazio ficou de fora" : `${r.pulados} passos vazios ficaram de fora`}. Cada clique põe um passo na conversa. Quem envia é você.`
      : "Cada clique põe um passo na conversa. Quem envia é você.";
    el.replaceChildren(
      h("h2", { class: "grupo-titulo" }, `${r.titulo} · ${rotuloProgresso(r, pos)}`),
      h("div", { class: "cartao tocador", role: "group", "aria-label": `Sequência ${r.titulo}` }, ...corpo),
      h("p", { class: "grupo-rodape" }, rodape),
    );
  }

  function mover(pos: Posicao) {
    if (!tocando) return;
    tocando = { ...tocando, pos };
    desenhar();
  }

  function desenhar() {
    if (ocupado) return;
    if (tocando) {
      const r = roteiroDe(tocando.seqId);
      // a sequência foi apagada no app, ou ficou sem passos: volta à lista
      if (!r || r.passos.length === 0) tocando = null;
      else {
        const pos = tocando.pos.passo > r.passos.length ? { passo: r.passos.length, acao: 0 } : tocando.pos;
        const acoes = r.passos[pos.passo]?.acoes.length ?? 0;
        tocando.pos = pos.acao >= acoes && pos.passo < r.passos.length ? { passo: pos.passo, acao: 0 } : pos;
        return tocador(r, tocando.pos);
      }
    }
    lista();
  }

  return {
    el,
    atualizar(c: RespostasDaConta) {
      conta = c;
      desenhar();
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Respostas prontas (criadas no app, em Configurações). Carrega ao abrir a aba, ao voltar ao painel
// e no botão Atualizar. O texto já sai com as variáveis preenchidas pelos dados da conta.

function secaoRespostas(aoPerderSessao: (erro: string) => void) {
  const campo = h("input", {
    type: "search",
    placeholder: "Título, texto ou /atalho",
    "aria-label": "Buscar resposta",
    autocomplete: "off",
  });
  const lista = h("div", { class: "grupo" });
  const sequencias = blocoSequencias(aoPerderSessao);
  let conta: RespostasDaConta | null = null;
  let carregando = false;

  const atualizar = h(
    "button",
    { class: "btn-pequeno neutro", type: "button", on: { click: () => carregar(true) } },
    "Atualizar",
  );

  function desenhar() {
    if (!conta) return;
    // buscando, só as respostas; sem busca, as sequências ficam em cima
    sequencias.el.hidden = campo.value.trim() !== "";
    if (conta.respostas.length === 0) {
      lista.replaceChildren(
        h(
          "div",
          { class: "cartao" },
          h(
            "div",
            { class: "vazio" },
            h("strong", {}, "Nenhuma resposta pronta"),
            "Crie no Marcon, em Configurações. Depois clique em Atualizar.",
            h("div", { style: "padding-top:12px" }, h("a", { class: "btn btn-secundario", href: `${BASE_LOJA}/configuracoes/respostas`, target: "_blank", rel: "noopener" }, "Abrir no Marcon")),
          ),
        ),
      );
      return;
    }
    const achadas = filtrarRespostas(conta.respostas, campo.value);
    if (achadas.length === 0) {
      lista.replaceChildren(h("div", { class: "cartao" }, h("div", { class: "vazio" }, h("strong", {}, "Nada encontrado"), "Tente outra palavra ou o atalho.")));
      return;
    }
    const dados = conta.dados;
    const titulo = achadas.length === 1 ? "1 resposta" : `${achadas.length} respostas`;
    lista.replaceChildren(
      h("h2", { class: "grupo-titulo" }, titulo),
      h(
        "div",
        { class: "cartao" },
        ...achadas.map((r) => {
          const texto = () => preencherVariaveis(r.texto, dados);
          return h(
            "div",
            { class: "resposta" },
            h(
              "div",
              { class: "info" },
              h("span", { class: "nome" }, r.titulo, r.atalho ? h("span", { class: "atalho" }, ` /${r.atalho}`) : null),
              h("span", { class: "previa" }, texto() || "Nada"),
              inserirCopiar(texto, r.titulo),
              ...(conta?.midias ?? [])
                .filter((m) => m.resposta_id === r.id)
                .map((m) => {
                  const voz = m.tipo === "audio";
                  const rotulo = voz ? "Enviar áudio de voz" : "Anexar";
                  const b = h("button", { class: "btn-pequeno neutro", type: "button", "aria-label": `${rotulo} ${m.titulo}` }, rotulo);
                  b.addEventListener("click", () =>
                    voz ? enviarAudioDeVoz(m.titulo, () => bytesDaMidia(m.id), b, aoPerderSessao) : anexarComBotao({ tipo: "anexarMidia", id: m.id }, b, aoPerderSessao),
                  );
                  return h("div", { class: "anexo-ligado" }, h("span", { class: "detalhe" }, `${ROTULO_TIPO[m.tipo]}: ${m.titulo}`), b);
                }),
            ),
          );
        }),
      ),
      h("p", { class: "grupo-rodape" }, "Inserir coloca o texto na conversa aberta. Quem envia é você."),
    );
  }

  async function carregar(manual = false) {
    if (carregando) return;
    carregando = true;
    atualizar.disabled = true;
    atualizar.textContent = "Atualizando...";
    if (!conta) lista.replaceChildren(h("p", { class: "vazio" }, "Carregando..."));
    const r = await pedir<RespostasDaConta>({ tipo: "respostas" });
    carregando = false;
    atualizar.disabled = false;
    atualizar.textContent = "Atualizar";
    if (!r.ok) {
      if (r.erro.includes("sessão")) return aoPerderSessao(r.erro);
      if (conta) avisar(r.erro, true);
      else lista.replaceChildren(h("p", { class: "erro-campo" }, r.erro));
      return;
    }
    conta = r.dados;
    sequencias.atualizar(conta);
    desenhar();
    if (manual) avisar(conta.respostas.length === 1 ? "1 resposta." : `${conta.respostas.length} respostas.`);
  }

  campo.addEventListener("input", desenhar);
  const el = h(
    "div",
    { class: "secao" },
    h("div", { class: "linha-busca" }, h("div", { class: "busca" }, iconeLupa(), campo), atualizar),
    sequencias.el,
    lista,
  );
  return { el, carregar, focar: () => campo.focus(), carregou: () => conta !== null };
}

// ---------------------------------------------------------------------------------------------
// Vender: venda rápida à vista (produto, quantidade, preço, pagamento, canal, cliente opcional).
// Cada tentativa leva uma chave (uuid). Repetir a mesma venda (rede caiu, clique de novo) manda a
// mesma chave e o banco devolve a venda que já entrou em vez de criar outra. Mudou qualquer coisa
// na venda: chave nova. Prazo, parcelas, desconto e encomenda ficam no app.

interface ItemCarrinho {
  chave: string; // produto ou produto:variação
  produtoId: string;
  variacaoId: string | null;
  nome: string;
  estoque: number;
  quantidade: number;
  preco: string; // como está no campo ("49,90")
}

// A venda em andamento é da conta que a montou. Se a sessão cai e a mesma conta volta, tudo fica
// (carrinho, cliente e chave: tentar de novo não duplica). Outra conta ou Sair limpa tudo.
const carrinho: ItemCarrinho[] = [];
let tentativa: { chave: string; assinatura: string } | null = null;
let clienteDaVenda: { escolhido: ClienteBusca | null; texto: string } = { escolhido: null, texto: "" };
let contaDaVenda: string | null = null;

function limparVenda() {
  carrinho.length = 0;
  tentativa = null;
  clienteDaVenda = { escolhido: null, texto: "" };
}

function vendaDaConta(email: string) {
  if (contaDaVenda !== email) limparVenda();
  contaDaVenda = email;
}

function precoNoCampo(valor: number) {
  return (Math.round(valor * 100) / 100).toFixed(2).replace(".", ",");
}

function secaoVender(aoPerderSessao: (erro: string) => void) {
  const el = h("div", { class: "secao" });
  let dados: DadosDaVenda | null = null;
  let carregando: Promise<void> | null = null;
  let enviando = false;

  // busca de produto (a mesma da aba Produtos)
  const campoBusca = h("input", { type: "search", placeholder: "Adicionar produto", "aria-label": "Buscar produto para vender", autocomplete: "off" });
  const achados = h("div", { class: "grupo" });
  const itensEl = h("section", { class: "grupo" });
  const forma = h("select", { class: "seletor", "aria-label": "Forma de pagamento" });
  const canal = h("select", { class: "seletor", "aria-label": "Canal" });
  const campoCliente = h("input", { class: "campo", type: "text", placeholder: "Nome ou telefone", "aria-label": "Cliente", autocomplete: "off", maxlength: "120" });
  const sugestoes = h("div", {});
  const clienteRodape = h("p", { class: "grupo-rodape" }, "Opcional. Sem cadastro, o nome vai só nesta venda.");
  const totalEl = h("span", { class: "total" }, formatarPreco(0));
  const resumoEl = h("span", { class: "detalhe" }, "Nenhum item");
  const erroEl = h("p", { class: "erro-campo", role: "alert" });
  const confirmar = h("button", { class: "btn btn-principal", type: "button" }, "Confirmar venda");

  // ---- busca
  let ultimo = 0;
  let timer: number | undefined;
  async function buscar() {
    const termo = campoBusca.value.trim();
    const n = ++ultimo;
    if (termo.length < 2) return achados.replaceChildren();
    const r = await pedir<ProdutoBusca[]>({ tipo: "buscar", termo });
    if (n !== ultimo) return;
    if (!r.ok) {
      if (r.erro.includes("sessão")) return aoPerderSessao(r.erro);
      return achados.replaceChildren(h("p", { class: "erro-campo" }, r.erro));
    }
    if (r.dados.length === 0) {
      return achados.replaceChildren(h("div", { class: "cartao" }, h("div", { class: "vazio" }, h("strong", {}, "Nada encontrado"), "Tente outra palavra, o SKU ou o código de barras.")));
    }
    const linhas: Node[] = [];
    for (const p of r.dados) {
      if (p.variacoes.length === 0) linhas.push(linhaAchado(p.nome, p.preco, p.estoque, () => adicionar(p)));
      else for (const v of p.variacoes) linhas.push(linhaAchado(`${p.nome} (${v.nome})`, v.preco, v.estoque, () => adicionar(p, v.id)));
    }
    achados.replaceChildren(h("div", { class: "cartao" }, ...linhas));
  }
  campoBusca.addEventListener("input", () => {
    clearTimeout(timer);
    timer = window.setTimeout(buscar, 250);
  });
  campoBusca.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      clearTimeout(timer);
      buscar();
    }
  });

  function linhaAchado(nome: string, preco: number, estoque: number, acao: () => void) {
    return h(
      "div",
      { class: "linha-item" },
      h("div", { class: "info" }, h("span", { class: "nome" }, nome), h("span", { class: "detalhe" }, `${formatarPreco(preco)} · `, rotuloEstoque(estoque))),
      h("button", { class: "btn-pequeno neutro", type: "button", "aria-label": `Adicionar ${nome}`, on: { click: acao } }, "Adicionar"),
    );
  }

  function adicionar(p: ProdutoBusca, variacaoId?: string) {
    const v = variacaoId ? p.variacoes.find((x) => x.id === variacaoId) : undefined;
    const chave = v ? `${p.id}:${v.id}` : p.id;
    const existente = carrinho.find((i) => i.chave === chave);
    if (existente) existente.quantidade += 1;
    else
      carrinho.push({
        chave,
        produtoId: p.id,
        variacaoId: v?.id ?? null,
        nome: v ? `${p.nome} (${v.nome})` : p.nome,
        estoque: v ? v.estoque : p.estoque,
        quantidade: 1,
        preco: precoNoCampo(v ? v.preco : p.preco),
      });
    campoBusca.value = "";
    achados.replaceChildren();
    desenharItens();
    avisar("Item adicionado.");
  }

  // ---- itens
  function desenharItens() {
    if (carrinho.length === 0) {
      itensEl.replaceChildren(
        h("h2", { class: "grupo-titulo" }, "Itens"),
        h("div", { class: "cartao" }, h("div", { class: "vazio" }, h("strong", {}, "Nenhum item"), "Busque o produto acima e toque em Adicionar.")),
      );
    } else {
      itensEl.replaceChildren(
        h("h2", { class: "grupo-titulo" }, carrinho.length === 1 ? "1 item" : `${carrinho.length} itens`),
        h("div", { class: "cartao" }, ...carrinho.map(linhaCarrinho)),
      );
    }
    atualizarResumo();
  }

  function linhaCarrinho(item: ItemCarrinho) {
    const qtd = h("input", { class: "qtd", type: "number", min: "1", step: "1", inputmode: "numeric", "aria-label": `Quantidade de ${item.nome}` });
    qtd.value = String(item.quantidade);
    const preco = h("input", { class: "preco-campo", type: "text", inputmode: "decimal", "aria-label": `Preço de ${item.nome}` });
    preco.value = item.preco;
    const aviso = h("span", { class: "detalhe" });
    const subtotal = h("span", { class: "subtotal" });

    function refletir() {
      const p = lerPreco(item.preco);
      subtotal.textContent = Number.isFinite(p) ? formatarPreco(totalDaVenda([{ quantidade: item.quantidade, preco_unitario: p }])) : "";
      preco.toggleAttribute("aria-invalid", !Number.isFinite(p));
      if (item.quantidade > item.estoque) {
        aviso.replaceChildren(h("span", { class: "estado-aviso" }, item.estoque <= 0 ? "Zerado" : `Só ${item.estoque} em estoque`));
      } else aviso.replaceChildren(rotuloEstoque(item.estoque));
      atualizarResumo();
    }
    const mudarQtd = (n: number) => {
      item.quantidade = Math.max(1, Math.min(MAX_QUANTIDADE, Math.trunc(n) || 1));
      qtd.value = String(item.quantidade);
      refletir();
    };
    qtd.addEventListener("change", () => mudarQtd(Number(qtd.value)));
    preco.addEventListener("input", () => {
      item.preco = preco.value;
      refletir();
    });
    preco.addEventListener("blur", () => {
      const p = lerPreco(item.preco);
      if (Number.isFinite(p)) preco.value = item.preco = precoNoCampo(p);
    });
    refletir();

    return h(
      "div",
      { class: "item-venda" },
      h("div", { class: "info" }, h("span", { class: "nome" }, item.nome), aviso),
      h(
        "div",
        { class: "controles" },
        h(
          "div",
          { class: "passo" },
          h("button", { type: "button", "aria-label": `Diminuir ${item.nome}`, on: { click: () => mudarQtd(item.quantidade - 1) } }, "−"),
          qtd,
          h("button", { type: "button", "aria-label": `Aumentar ${item.nome}`, on: { click: () => mudarQtd(item.quantidade + 1) } }, "+"),
        ),
        h("label", { class: "preco-rotulo" }, "R$", preco),
        subtotal,
      ),
      h(
        "button",
        {
          class: "texto-perigo pequeno",
          type: "button",
          "aria-label": `Tirar ${item.nome}`,
          on: {
            click: () => {
              carrinho.splice(carrinho.indexOf(item), 1);
              desenharItens();
            },
          },
        },
        "Tirar",
      ),
    );
  }

  // ---- cliente (opcional): cadastrado pelo nome ou telefone, ou só o nome livre
  campoCliente.value = clienteDaVenda.texto;
  campoCliente.addEventListener("input", () => {
    clienteDaVenda.escolhido = null;
    clienteDaVenda.texto = campoCliente.value;
    desenharSugestoes();
  });
  function desenharSugestoes() {
    const termo = campoCliente.value;
    if (clienteDaVenda.escolhido) {
      sugestoes.replaceChildren();
      clienteRodape.textContent = clienteDaVenda.escolhido.telefone ? `Cliente cadastrado · ${clienteDaVenda.escolhido.telefone}` : "Cliente cadastrado";
      return;
    }
    const lista = dados ? filtrarClientes(dados.clientes, termo, 5) : [];
    sugestoes.replaceChildren(
      ...lista.map((c) =>
        h(
          "button",
          {
            class: "sugestao",
            type: "button",
            on: {
              click: () => {
                clienteDaVenda.escolhido = c;
                campoCliente.value = clienteDaVenda.texto = c.nome;
                desenharSugestoes();
              },
            },
          },
          h("span", { class: "nome" }, c.nome),
          c.telefone ? h("span", { class: "detalhe" }, c.telefone) : null,
        ),
      ),
    );
    const soNumero = soDigitos(termo).length > 0 && !/\p{L}/u.test(termo);
    clienteRodape.textContent = !termo.trim()
      ? "Opcional. Sem cadastro, o nome vai só nesta venda."
      : soNumero && lista.length === 0
        ? "Nenhum cliente com esse telefone. Digite o nome para vender avulsa."
        : lista.length > 0
          ? "Toque no cliente ou siga com o nome digitado (avulsa)."
          : "Sem cadastro: o nome vai só nesta venda.";
  }

  function montarVenda(): Omit<VendaRapida, "chave"> | string {
    if (carrinho.length === 0) return "Adicione pelo menos um produto.";
    const itens: ItemVendaRapida[] = [];
    for (const i of carrinho) {
      const p = lerPreco(i.preco);
      if (!Number.isFinite(p)) return `Confira o preço de ${i.nome}.`;
      itens.push({ produto_id: i.produtoId, variacao_id: i.variacaoId, quantidade: i.quantidade, preco_unitario: p });
    }
    const falta = carrinho.find((i) => i.quantidade > i.estoque);
    if (falta) {
      return falta.estoque <= 0
        ? `${falta.nome} está zerado. Tire o item ou venda como encomenda pelo app.`
        : `Só ${falta.estoque} de ${falta.nome} em estoque. Ajuste a quantidade ou venda como encomenda pelo app.`;
    }
    const nomeLivre = campoCliente.value.replace(/\s+/g, " ").trim();
    return {
      itens,
      formaPagamentoId: forma.value || null,
      canalId: canal.value || null,
      clienteId: clienteDaVenda.escolhido?.id ?? null,
      clienteNome: clienteDaVenda.escolhido ? clienteDaVenda.escolhido.nome : /\p{L}/u.test(nomeLivre) ? nomeLivre : null,
    };
  }

  function atualizarResumo() {
    const itens = carrinho.map((i) => ({ quantidade: i.quantidade, preco_unitario: lerPreco(i.preco) }));
    const validos = itens.every((i) => Number.isFinite(i.preco_unitario));
    const total = validos ? totalDaVenda(itens) : 0;
    const unidades = carrinho.reduce((s, i) => s + i.quantidade, 0);
    totalEl.textContent = validos ? formatarPreco(total) : "Confira os preços";
    resumoEl.textContent = carrinho.length === 0 ? "Nenhum item" : `${unidades === 1 ? "1 unidade" : `${unidades} unidades`} · À vista`;
    if (!enviando) {
      confirmar.disabled = carrinho.length === 0 || !validos;
      confirmar.textContent = carrinho.length && validos ? `Confirmar venda · ${formatarPreco(total)}` : "Confirmar venda";
    }
    erroEl.textContent = "";
  }

  confirmar.addEventListener("click", async () => {
    if (enviando) return;
    const venda = montarVenda();
    if (typeof venda === "string") {
      erroEl.textContent = venda;
      return;
    }
    const assinatura = assinaturaDaVenda(venda);
    if (!tentativa || tentativa.assinatura !== assinatura) tentativa = { chave: crypto.randomUUID(), assinatura };
    enviando = true;
    confirmar.disabled = true;
    confirmar.textContent = "Registrando...";
    erroEl.textContent = "";
    const r = (await pedir<VendaFeita>({ tipo: "vender", venda: { ...venda, chave: tentativa.chave } })) as RespostaVenda;
    enviando = false;
    if (r.ok) {
      limparVenda();
      campoCliente.value = "";
      telaFeita(r.dados);
      return;
    }
    if (r.erro.includes("sessão")) return aoPerderSessao(r.erro);
    atualizarResumo();
    erroEl.textContent = r.erro; // com "incerto", a chave fica: tentar de novo não duplica
  });

  // ---- depois da venda
  function telaFeita(v: VendaFeita) {
    const recibo = `${BASE_LOJA}/r/${v.reciboToken}`;
    el.replaceChildren(
      grupo(
        null,
        h(
          "div",
          { class: "feita" },
          h("strong", {}, v.criada ? "Venda registrada" : "Venda já registrada"),
          h("span", { class: "total" }, formatarPreco(v.total)),
          v.criada ? h("span", { class: "detalhe" }, "Estoque e caixa atualizados.") : h("span", { class: "detalhe" }, "Ela já tinha entrado. Nada foi duplicado."),
        ),
      ),
      h(
        "div",
        { class: "grupo" },
        h(
          "button",
          {
            class: "btn btn-principal",
            type: "button",
            on: {
              click: async () => {
                const texto = `Recibo da sua compra: ${recibo}`;
                const r = await pedir<string>({ tipo: "inserir", texto });
                if (r.ok) avisar(r.dados);
                else {
                  const copiou = await copiar(texto);
                  avisar(copiou ? `${r.erro} Já copiei o link: clique na caixa e cole.` : r.erro, true);
                }
              },
            },
          },
          "Inserir link do recibo",
        ),
        h("a", { class: "btn btn-secundario", href: `${BASE_LOJA}/vendas/${encodeURIComponent(v.vendaId)}`, target: "_blank", rel: "noopener" }, "Abrir no Marcon"),
        h("p", { class: "grupo-rodape" }, "Inserir coloca o link na conversa aberta. Quem envia é você."),
      ),
      h("div", {}, h("button", { class: "texto-marca", type: "button", on: { click: () => montar() } }, "Nova venda")),
    );
  }

  // ---- montagem
  function opcoes(sel: HTMLSelectElement, lista: Opcao[], vazio: string, escolhido: string | null) {
    sel.replaceChildren(h("option", { value: "" }, vazio), ...lista.map((o) => h("option", { value: o.id }, o.nome)));
    sel.value = escolhido && lista.some((o) => o.id === escolhido) ? escolhido : "";
  }

  async function carregar() {
    const r = await pedir<DadosDaVenda>({ tipo: "dadosVenda" });
    if (!r.ok) {
      if (r.erro.includes("sessão")) return aoPerderSessao(r.erro);
      avisar(r.erro, true);
      return;
    }
    const formaAntes = forma.value || null;
    const canalAntes = canal.value || null;
    const primeira = dados === null;
    dados = r.dados;
    const pix = dados.formas.find((f) => semAcento(f.nome).trim() === "pix");
    opcoes(forma, dados.formas, "Não informar", primeira ? (pix?.id ?? null) : formaAntes);
    opcoes(canal, dados.canais, "Não informar", primeira ? (canalPadrao(dados.canais)?.id ?? null) : canalAntes);
    desenharSugestoes();
  }

  function linhaSeletor(rotulo: string, sel: HTMLSelectElement) {
    return h("label", { class: "linha-seletor" }, h("span", {}, rotulo), sel);
  }

  function montar() {
    erroEl.textContent = "";
    el.replaceChildren(
      h("div", { class: "busca" }, iconeLupa(), campoBusca),
      achados,
      itensEl,
      grupo("Pagamento", h("div", {}, linhaSeletor("Forma", forma), linhaSeletor("Canal", canal)), "À vista. Prazo, parcelas e desconto, só no app."),
      h("section", { class: "grupo" }, h("h2", { class: "grupo-titulo" }, "Cliente"), h("div", { class: "cartao" }, campoCliente, sugestoes), clienteRodape),
      h("div", { class: "grupo" }, h("div", { class: "resumo" }, h("span", { class: "detalhe" }, "Total"), totalEl, resumoEl), confirmar, erroEl),
    );
    desenharItens();
    carregando = carregar().finally(() => (carregando = null));
  }

  return {
    el,
    abrir: () => {
      if (!el.firstChild) montar();
      else if (!carregando && !enviando && el.contains(campoBusca)) carregando = carregar().finally(() => (carregando = null));
      if (el.contains(campoBusca)) campoBusca.focus();
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Mídia: biblioteca da conta (criada no app, em Configurações) e áudio gravado aqui no painel.

function miniaturaMidia(m: MidiaPainel) {
  if (m.miniatura) return h("img", { class: "capa", src: m.miniatura, alt: "", loading: "lazy" });
  return h("div", { class: `capa vazia tipo-${m.tipo}`, "aria-hidden": "true" }, m.tipo === "documento" ? "PDF" : m.tipo === "audio" ? "Áudio" : "Foto");
}

// Gravar áudio com o microfone. Vai como mensagem de voz para a conversa aberta, só no clique do dono
// em "Enviar áudio de voz" e depois de ele confirmar o nome da conversa.
function gravador(aoSalvar: () => void, aoPerderSessao: (erro: string) => void) {
  const corpo = h("div", { class: "gravador" });
  let gravacao: { blob: Blob; ext: string; duracao: number; url: string } | null = null;
  let parar: (() => void) | null = null;

  function inicio() {
    gravacao && URL.revokeObjectURL(gravacao.url);
    gravacao = null;
    const botao = h("button", { class: "btn-pequeno destaque", type: "button" }, "Gravar áudio");
    botao.addEventListener("click", comecar);
    corpo.replaceChildren(
      h("div", { class: "info" }, h("span", { class: "nome" }, "Áudio na hora"), h("span", { class: "detalhe" }, `Até ${formatarDuracao(LIMITE_GRAVACAO_SEG)}. Vai como mensagem de voz para a conversa aberta.`)),
      botao,
    );
  }

  function semMicrofone(texto: string) {
    const liberar = h("button", { class: "btn-pequeno neutro", type: "button" }, "Liberar microfone");
    liberar.addEventListener("click", () => pedir({ tipo: "abrirMicrofone" }));
    const voltar = h("button", { class: "btn-pequeno neutro", type: "button" }, "Voltar");
    voltar.addEventListener("click", inicio);
    corpo.replaceChildren(h("div", { class: "info" }, h("span", { class: "nome" }, "Sem microfone"), h("span", { class: "detalhe" }, texto)), h("div", { class: "acoes" }, liberar, voltar));
  }

  async function comecar() {
    const formato = typeof MediaRecorder === "undefined" ? null : formatoDeGravacao((t) => MediaRecorder.isTypeSupported(t));
    if (!formato) {
      return avisar("Este navegador não grava num formato que o WhatsApp aceita. Grave no celular e suba no Marcon.", true);
    }
    let fluxo: MediaStream;
    try {
      fluxo = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      const nome = (e as DOMException)?.name;
      if (nome === "NotFoundError") return semMicrofone("Nenhum microfone encontrado neste computador.");
      return semMicrofone("O navegador não deixou usar o microfone aqui. Clique em Liberar microfone, permita na aba que abrir e volte.");
    }
    const pedacos: Blob[] = [];
    const rec = new MediaRecorder(fluxo, { mimeType: formato.mime, audioBitsPerSecond: 64000 });
    const ini = Date.now();
    let cancelado = false;
    rec.ondataavailable = (ev) => ev.data.size > 0 && pedacos.push(ev.data);
    rec.onstop = () => {
      clearInterval(relogio);
      fluxo.getTracks().forEach((t) => t.stop());
      parar = null;
      if (cancelado) return inicio();
      const blob = new Blob(pedacos, { type: formato.mime.split(";")[0] });
      if (blob.size === 0) {
        avisar("A gravação ficou vazia. Tente de novo.", true);
        return inicio();
      }
      gravacao = { blob, ext: formato.ext, duracao: Math.min(LIMITE_GRAVACAO_SEG, (Date.now() - ini) / 1000), url: URL.createObjectURL(blob) };
      pronto();
    };
    rec.start(1000);

    const tempo = h("span", { class: "detalhe", role: "timer" }, `0:00 de ${formatarDuracao(LIMITE_GRAVACAO_SEG)}`);
    const relogio = window.setInterval(() => {
      const seg = (Date.now() - ini) / 1000;
      tempo.textContent = `${formatarDuracao(seg)} de ${formatarDuracao(LIMITE_GRAVACAO_SEG)}`;
      if (seg >= LIMITE_GRAVACAO_SEG && rec.state === "recording") rec.stop();
    }, 250);
    const pararBotao = h("button", { class: "btn-pequeno destaque", type: "button" }, "Parar");
    pararBotao.addEventListener("click", () => rec.state === "recording" && rec.stop());
    const cancelar = h("button", { class: "btn-pequeno neutro", type: "button" }, "Cancelar");
    cancelar.addEventListener("click", () => {
      cancelado = true;
      if (rec.state === "recording") rec.stop();
    });
    parar = () => {
      cancelado = true;
      if (rec.state === "recording") rec.stop();
    };
    corpo.replaceChildren(
      h("div", { class: "info" }, h("span", { class: "nome" }, h("span", { class: "ponto-gravando", "aria-hidden": "true" }), "Gravando no painel"), tempo),
      h("div", { class: "acoes" }, pararBotao, cancelar),
    );
  }

  function pronto() {
    if (!gravacao) return inicio();
    const g = gravacao;
    const agora = new Date();
    const titulo = h("input", {
      class: "campo-pequeno",
      type: "text",
      maxlength: "80",
      "aria-label": "Nome do áudio",
      value: `Áudio ${agora.toLocaleDateString("pt-BR")} ${agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`,
    });
    const enviar = h("button", { class: "btn-pequeno destaque", type: "button" }, "Enviar áudio de voz");
    const salvar = h("button", { class: "btn-pequeno neutro", type: "button" }, "Salvar na biblioteca");
    const descartar = h("button", { class: "btn-pequeno neutro", type: "button" }, "Descartar");
    const base64 = async () => paraBase64(await g.blob.arrayBuffer());
    enviar.addEventListener("click", () => enviarAudioDeVoz(titulo.value || "Áudio gravado", () => g.blob.arrayBuffer(), enviar, aoPerderSessao));
    salvar.addEventListener("click", async () => {
      salvar.disabled = true;
      salvar.textContent = "Salvando...";
      const r = await pedir({ tipo: "salvarGravacao", base64: await base64(), ext: g.ext, titulo: titulo.value, duracao: g.duracao });
      salvar.disabled = false;
      salvar.textContent = "Salvar na biblioteca";
      if (!r.ok) {
        if (r.erro.includes("sessão")) return aoPerderSessao(r.erro);
        return avisar(r.erro, true);
      }
      avisar("Áudio salvo na biblioteca.");
      inicio();
      aoSalvar();
    });
    descartar.addEventListener("click", inicio);
    corpo.replaceChildren(
      h("div", { class: "info" }, h("span", { class: "nome" }, "Áudio gravado"), h("span", { class: "detalhe" }, formatarDuracao(g.duracao))),
      h("audio", { controls: "", src: g.url, preload: "metadata" }),
      titulo,
      h("div", { class: "acoes" }, enviar, salvar, descartar),
    );
  }

  inicio();
  return { el: corpo, cancelar: () => parar?.() };
}

function secaoMidia(aoPerderSessao: (erro: string) => void) {
  const campo = h("input", { type: "search", placeholder: "Produto ou arquivo", "aria-label": "Buscar produto ou arquivo", autocomplete: "off" });
  const lista = h("div", { class: "grupo" });
  let midias: MidiaPainel[] | null = null;
  let carregando = false;
  let tocando: { id: string; audio: HTMLAudioElement; botao: HTMLButtonElement } | null = null;

  const atualizar = h("button", { class: "btn-pequeno neutro", type: "button", on: { click: () => carregar(true) } }, "Atualizar");
  const grav = gravador(() => carregar(), aoPerderSessao);

  async function ouvir(m: MidiaPainel, botao: HTMLButtonElement) {
    if (tocando) {
      tocando.audio.pause();
      tocando.botao.textContent = "Ouvir";
      const mesmo = tocando.id === m.id;
      tocando = null;
      if (mesmo) return;
    }
    const r = await pedir<string>({ tipo: "urlMidia", id: m.id });
    if (!r.ok) return avisar(r.erro, true);
    const audio = new Audio(r.dados);
    tocando = { id: m.id, audio, botao };
    botao.textContent = "Parar";
    audio.addEventListener("ended", () => {
      botao.textContent = "Ouvir";
      tocando = null;
    });
    audio.play().catch(() => {
      botao.textContent = "Ouvir";
      tocando = null;
      avisar("Não deu para tocar o áudio aqui.", true);
    });
  }

  // Fotos do estoque: produtos com foto (os primeiros em ordem de nome, ou os da busca)
  const listaProdutos = h("div", { class: "grupo" });
  let produtos: ProdutoComFoto[] | null = null;
  let ultimaBusca = 0;
  let timer: number | undefined;

  async function carregarProdutos() {
    const n = ++ultimaBusca;
    const r = await pedir<ProdutoComFoto[]>({ tipo: "produtosComFoto", termo: campo.value.trim() });
    if (n !== ultimaBusca) return; // chegou resposta de uma busca antiga
    if (!r.ok) {
      if (r.erro.includes("sessão")) return aoPerderSessao(r.erro);
      listaProdutos.replaceChildren(h("p", { class: "erro-campo" }, r.erro));
      return;
    }
    produtos = r.dados;
    desenharProdutos();
  }

  function desenharProdutos() {
    if (!produtos) return;
    const buscando = campo.value.trim().length >= 2;
    if (produtos.length === 0) {
      listaProdutos.replaceChildren(
        h("h2", { class: "grupo-titulo" }, "Fotos do estoque"),
        h("div", { class: "cartao" }, h("div", { class: "vazio" }, h("strong", {}, buscando ? "Nenhum produto com foto" : "Nenhum produto com foto ainda"), buscando ? "Tente outra palavra." : "Ponha fotos nos produtos, no Marcon.")),
      );
      return;
    }
    listaProdutos.replaceChildren(
      h("h2", { class: "grupo-titulo" }, "Fotos do estoque"),
      h(
        "div",
        { class: "cartao" },
        ...produtos.map((p) =>
          h(
            "div",
            { class: "produto" },
            p.capa ? h("img", { class: "capa", src: p.capa, alt: "", loading: "lazy" }) : h("div", { class: "capa vazia", "aria-hidden": "true" }, (p.nome.trim()[0] ?? "?").toUpperCase()),
            h("div", { class: "info" }, h("span", { class: "nome" }, p.nome), fotosDoItem(p)),
          ),
        ),
      ),
      h("p", { class: "grupo-rodape" }, buscando ? "Anexar abre a prévia do WhatsApp com a foto. Quem envia é você." : "Alguns produtos com foto. Busque pelo nome para achar outro."),
    );
  }

  function desenhar() {
    if (!midias) return;
    // biblioteca da conta: só aparece quando tem arquivo
    if (midias.length === 0) return lista.replaceChildren();
    const achadas = filtrarMidias(midias, campo.value);
    if (achadas.length === 0) {
      lista.replaceChildren(h("h2", { class: "grupo-titulo" }, "Biblioteca"), h("div", { class: "cartao" }, h("div", { class: "vazio" }, h("strong", {}, "Nada na biblioteca"), "Tente outra palavra.")));
      return;
    }
    lista.replaceChildren(
      h("h2", { class: "grupo-titulo" }, achadas.length === 1 ? "Biblioteca · 1 arquivo" : `Biblioteca · ${achadas.length} arquivos`),
      h(
        "div",
        { class: "cartao" },
        ...achadas.map((m) => {
          const voz = m.tipo === "audio";
          const rotulo = voz ? "Enviar áudio de voz" : "Anexar";
          const acao = h("button", { class: "btn-pequeno destaque", type: "button", "aria-label": `${rotulo} ${m.titulo}` }, rotulo);
          acao.addEventListener("click", () =>
            voz ? enviarAudioDeVoz(m.titulo, () => bytesDaMidia(m.id), acao, aoPerderSessao) : anexarComBotao({ tipo: "anexarMidia", id: m.id }, acao, aoPerderSessao),
          );
          const ouvirBotao = voz ? h("button", { class: "btn-pequeno neutro", type: "button", "aria-label": `Ouvir ${m.titulo}` }, "Ouvir") : null;
          ouvirBotao?.addEventListener("click", () => ouvir(m, ouvirBotao));
          return h(
            "div",
            { class: "produto" },
            miniaturaMidia(m),
            h("div", { class: "info" }, h("span", { class: "nome" }, m.titulo), h("span", { class: "detalhe" }, detalheDaMidia(m)), h("div", { class: "acoes" }, acao, ouvirBotao)),
          );
        }),
      ),
      h("p", { class: "grupo-rodape" }, "Anexar abre a prévia do WhatsApp; o áudio vai como mensagem de voz depois de você confirmar a conversa."),
    );
  }

  async function carregar(manual = false) {
    if (carregando) return;
    carregando = true;
    atualizar.disabled = true;
    atualizar.textContent = "Atualizando...";
    if (!produtos) listaProdutos.replaceChildren(h("p", { class: "vazio" }, "Carregando..."));
    const [r] = await Promise.all([pedir<MidiaPainel[]>({ tipo: "midias" }), carregarProdutos()]);
    carregando = false;
    atualizar.disabled = false;
    atualizar.textContent = "Atualizar";
    if (!r.ok) {
      if (r.erro.includes("sessão")) return aoPerderSessao(r.erro);
      if (midias) avisar(r.erro, true);
      else lista.replaceChildren(h("p", { class: "erro-campo" }, r.erro));
      return;
    }
    midias = r.dados;
    desenhar();
    if (manual) avisar("Lista atualizada.");
  }

  campo.addEventListener("input", () => {
    desenhar();
    clearTimeout(timer);
    timer = window.setTimeout(carregarProdutos, 250);
  });
  const el = h(
    "div",
    { class: "secao" },
    h("div", { class: "linha-busca" }, h("div", { class: "busca" }, iconeLupa(), campo), atualizar),
    grupo("Gravar", grav.el),
    listaProdutos,
    lista,
  );
  return { el, carregar, focar: () => campo.focus(), carregou: () => midias !== null, parar: () => { grav.cancelar(); tocando?.audio.pause(); } };
}

// Conta no rodapé, como no site: bolinha com a inicial; o clique abre o e-mail e o Sair.
function contaNoRodape(email: string, sair: HTMLButtonElement) {
  const menu = h("div", { class: "conta-menu", id: "conta-menu", hidden: "", role: "group", "aria-label": "Sua conta" }, h("span", { class: "detalhe conta-email" }, email), sair);
  const botao = h(
    "button",
    { class: "conta-avatar", type: "button", "aria-label": `Conta: ${email}`, "aria-expanded": "false", "aria-controls": "conta-menu", title: email },
    (email.trim()[0] ?? "M").toUpperCase(),
  );
  botao.addEventListener("click", () => {
    const abrir = menu.hidden;
    menu.hidden = !abrir;
    botao.setAttribute("aria-expanded", String(abrir));
  });
  return h("footer", { class: "rodape-conta" }, menu, botao);
}

// voltar ao painel (ou à aba do WhatsApp, no painel embutido) traz a lista nova do app
let recarregarRespostas: (() => void) | null = null;
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") recarregarRespostas?.();
});

function telaPrincipal(sessao: Sessao) {
  vendaDaConta(sessao.email);
  const campo = h("input", {
    type: "search",
    placeholder: "Nome, SKU, marca ou código",
    "aria-label": "Buscar produto",
    autocomplete: "off",
  });
  const lupa = iconeLupa();

  const resultados = h("div", { class: "grupo" });
  avisoEl = h("div", { class: "aviso", hidden: "", role: "status", "aria-live": "polite" });

  let ultimo = 0;
  let timer: number | undefined;
  async function buscar() {
    const termo = campo.value.trim();
    const n = ++ultimo;
    if (termo.length < 2) {
      resultados.replaceChildren();
      return;
    }
    const r = await pedir<ProdutoBusca[]>({ tipo: "buscar", termo });
    if (n !== ultimo) return; // chegou resposta de uma busca antiga
    if (!r.ok) {
      if (r.erro.includes("sessão")) return telaEntrar(r.erro);
      resultados.replaceChildren(h("p", { class: "erro-campo" }, r.erro));
      return;
    }
    if (r.dados.length === 0) {
      resultados.replaceChildren(
        h("div", { class: "cartao" }, h("div", { class: "vazio" }, h("strong", {}, "Nada encontrado"), "Tente outra palavra, o SKU ou o código de barras.")),
      );
      return;
    }
    const titulo = r.dados.length === 1 ? "1 produto" : `${r.dados.length} produtos`;
    resultados.replaceChildren(
      h("h2", { class: "grupo-titulo" }, titulo),
      h("div", { class: "cartao" }, ...r.dados.map(itemProduto)),
      h("p", { class: "grupo-rodape" }, "Inserir coloca o texto na conversa aberta; Anexar abre a prévia com a foto. Quem envia é você."),
    );
  }
  campo.addEventListener("input", () => {
    clearTimeout(timer);
    timer = window.setTimeout(buscar, 250);
  });
  campo.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      clearTimeout(timer);
      buscar();
    }
  });

  const sair = h(
    "button",
    {
      class: "texto-perigo sair",
      type: "button",
      on: {
        click: async () => {
          midia.parar();
          await pedir({ tipo: "sair" });
          limparVenda();
          contaDaVenda = null;
          telaEntrar();
        },
      },
    },
    "Sair",
  );

  const produtos = h("div", { class: "secao" }, h("div", { class: "busca" }, lupa, campo), resultados);
  const sairDaSessao = (erro: string) => {
    midia.parar();
    telaEntrar(erro);
  };
  perderSessao = sairDaSessao;
  const respostas = secaoRespostas(sairDaSessao);
  respostas.el.hidden = true;
  const midia = secaoMidia(sairDaSessao);
  midia.el.hidden = true;
  const vender = secaoVender(sairDaSessao);
  vender.el.hidden = true;

  // controle segmentado: Produtos, Respostas, Mídia ou Vender (a escolha vale enquanto o painel está aberto)
  type Aba = "produtos" | "respostas" | "midia" | "vender";
  const botaoAba = (rotulo: string, aba: Aba) =>
    h("button", { type: "button", role: "tab", "aria-selected": "false", on: { click: () => mostrar(aba) } }, rotulo);
  const abas: Record<Aba, HTMLButtonElement> = {
    produtos: botaoAba("Produtos", "produtos"),
    respostas: botaoAba("Respostas", "respostas"),
    midia: botaoAba("Mídia", "midia"),
    vender: botaoAba("Vender", "vender"),
  };
  function mostrar(aba: Aba) {
    produtos.hidden = aba !== "produtos";
    respostas.el.hidden = aba !== "respostas";
    midia.el.hidden = aba !== "midia";
    vender.el.hidden = aba !== "vender";
    for (const [nome, botao] of Object.entries(abas)) botao.setAttribute("aria-selected", String(nome === aba));
    sessionStorage.setItem("marcon_aba", aba);
    if (aba === "respostas") {
      if (!respostas.carregou()) respostas.carregar();
      respostas.focar();
    } else if (aba === "midia") {
      if (!midia.carregou()) midia.carregar();
      midia.focar();
    } else if (aba === "vender") vender.abrir();
    else campo.focus();
  }

  recarregarRespostas = () => {
    if (respostas.carregou() && document.body.contains(respostas.el)) respostas.carregar();
    if (midia.carregou() && document.body.contains(midia.el)) midia.carregar();
  };

  app.replaceChildren(
    topo(),
    h("div", { class: "abas", role: "tablist", "aria-label": "O que fazer" }, abas.produtos, abas.respostas, abas.midia, abas.vender),
    produtos,
    respostas.el,
    midia.el,
    vender.el,
    contaNoRodape(sessao.email, sair),
    avisoEl,
  );
  const salva = sessionStorage.getItem("marcon_aba");
  mostrar(salva === "respostas" || salva === "midia" || salva === "vender" ? salva : "produtos");
}

// ---------------------------------------------------------------------------------------------

async function iniciar() {
  app.replaceChildren(topo(), h("p", { class: "vazio" }, "Carregando..."));
  const r = await pedir<Sessao | null>({ tipo: "sessao" });
  if (r.ok && r.dados) telaPrincipal(r.dados);
  else telaEntrar();
}

// Login pelo Google numa aba (plano B): quando a sessão chega, o painel aberto se atualiza.
chrome.storage.onChanged.addListener((mudou, area) => {
  if (area !== "local") return;
  if (Object.keys(mudou).some((k) => k.startsWith("sb-") && k.endsWith("-auth-token"))) {
    if (!document.querySelector(".busca")) iniciar();
  }
});

iniciar();
