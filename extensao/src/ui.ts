// Peças de tela do painel, em DOM puro: todo texto vindo do banco entra por textContent, nunca como
// HTML. As peças seguem docs/DESIGN.md (Grupo, botões, campos, Segmentado) com as classes de painel.css.
import { icone, type NomeIcone } from "./icones.ts";

type Filho = Node | string | null | undefined | false;
export function h<K extends keyof HTMLElementTagNameMap>(
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

export function grupo(titulo: string | null, conteudo: Node, rodape?: string) {
  return h(
    "section",
    { class: "grupo" },
    titulo ? h("h2", { class: "grupo-titulo" }, titulo) : null,
    h("div", { class: "cartao" }, conteudo),
    rodape ? h("p", { class: "grupo-rodape" }, rodape) : null,
  );
}

// Título do grupo com uma ação de texto à direita (Organizar, Pronto)
export function cabecaDoGrupo(titulo: string, acao?: HTMLButtonElement | null) {
  return h("div", { class: "grupo-cabeca" }, h("h2", { class: "grupo-titulo" }, titulo), acao ?? null);
}

export function botaoTexto(rotulo: string, fazer: () => void, rotuloAcessivel?: string) {
  return h("button", { class: "texto-marca pequeno", type: "button", "aria-label": rotuloAcessivel, on: { click: fazer } }, rotulo);
}

// Linha "+ Nova resposta" no fim do cartão (como o "Adicionar" dos Ajustes do iPhone)
export function linhaNova(rotulo: string, fazer: () => void) {
  return h("button", { class: "linha-nova", type: "button", on: { click: fazer } }, icone("mais", 18), rotulo);
}

export function botaoIcone(nome: NomeIcone, rotulo: string, fazer: () => void) {
  return h("button", { class: "btn-icone", type: "button", "aria-label": rotulo, title: rotulo, on: { click: fazer } }, icone(nome, 18));
}

// Subir e descer a linha (as mesmas setas das telas do app)
export function setas(nome: string, i: number, total: number, mover: (i: number, delta: -1 | 1) => void) {
  const subir = botaoIcone("acima", `Subir ${nome}`, () => mover(i, -1));
  const descer = botaoIcone("abaixo", `Descer ${nome}`, () => mover(i, 1));
  subir.disabled = i === 0;
  descer.disabled = i === total - 1;
  return h("div", { class: "setas" }, subir, descer);
}

// "‹ Respostas": volta à lista, na cor da marca, como o back do PageHeader do app
export function cabecalhoEditor(voltarPara: string, titulo: string, aoVoltar: () => void) {
  return h(
    "div",
    { class: "cabecalho-editor" },
    h("button", { class: "voltar", type: "button", on: { click: aoVoltar } }, icone("voltar", 18), voltarPara),
    h("h1", { class: "titulo-editor" }, titulo),
  );
}

// Campo com rótulo dentro do cartão (como o Field do app)
export function campoComRotulo(rotulo: string, campo: HTMLElement, dica?: HTMLElement | string) {
  return h("label", { class: "campo-rotulado" }, h("span", { class: "rotulo-campo" }, rotulo), campo, dica ? (typeof dica === "string" ? h("span", { class: "dica" }, dica) : dica) : null);
}

// Segmentado (escolha dentro de formulário), o mesmo jeito do Segmentado do app
export function segmentado<T extends string>(rotulo: string, opcoes: { valor: T; rotulo: string }[], valor: T, aoMudar: (v: T) => void) {
  const el = h("div", { class: "segmentado", role: "radiogroup", "aria-label": rotulo });
  const botoes = opcoes.map((o) => {
    const b = h("button", { type: "button", role: "radio", "aria-checked": String(o.valor === valor) }, o.rotulo);
    b.addEventListener("click", () => {
      for (const x of botoes) x.setAttribute("aria-checked", String(x === b));
      aoMudar(o.valor);
    });
    return b;
  });
  el.append(...botoes);
  return el;
}

// Aviso que some sozinho (barra escura no pé do painel)
let avisoEl: HTMLDivElement | null = null;
let avisoTimer: number | undefined;
export function criarAviso() {
  avisoEl = h("div", { class: "aviso", hidden: "", role: "status", "aria-live": "polite" });
  return avisoEl;
}
export function avisar(texto: string, erro = false, acao?: { rotulo: string; fazer: () => void }) {
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

// Pergunta antes de apagar ou mover (como o ConfirmButton do app): true só no clique no botão de ação
export function confirmarApagar(titulo: string, texto: string, rotulo = "Apagar", perigo = true): Promise<boolean> {
  return new Promise((resolve) => {
    const fundo = h("div", { class: "confirmar-fundo" });
    const apagar = h("button", { class: perigo ? "btn btn-perigo" : "btn btn-principal", type: "button" }, rotulo);
    const cancelar = h("button", { class: "btn btn-secundario", type: "button" }, "Cancelar");
    const fechar = (ok: boolean) => {
      fundo.remove();
      document.removeEventListener("keydown", tecla);
      resolve(ok);
    };
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && fechar(false);
    apagar.addEventListener("click", () => fechar(true));
    cancelar.addEventListener("click", () => fechar(false));
    fundo.addEventListener("click", (e) => e.target === fundo && fechar(false));
    fundo.append(h("div", { class: "confirmar", role: "alertdialog", "aria-modal": "true", "aria-label": titulo }, h("strong", {}, titulo), h("span", { class: "detalhe" }, texto), apagar, cancelar));
    document.body.append(fundo);
    document.addEventListener("keydown", tecla);
    cancelar.focus();
  });
}

// Botão que mostra "Salvando..." enquanto a ação corre e volta ao rótulo no fim
export async function comBotao<T>(botao: HTMLButtonElement, ocupado: string, fazer: () => Promise<T>): Promise<T> {
  const antes = [...botao.childNodes];
  botao.disabled = true;
  botao.textContent = ocupado;
  try {
    return await fazer();
  } finally {
    botao.disabled = false;
    botao.replaceChildren(...antes);
  }
}

// Telas empilhadas dentro de uma aba: a lista fica guardada (com a busca e a rolagem) enquanto o
// editor está aberto; Voltar tira o editor e mostra a lista de novo.
export function pilhaDeTelas(base: HTMLElement) {
  const telas: HTMLElement[] = [];
  return {
    abrir(tela: HTMLElement) {
      (telas.at(-1) ?? base).hidden = true;
      telas.push(tela);
      base.parentElement?.append(tela);
      tela.querySelector<HTMLElement>("input, textarea")?.focus();
      window.scrollTo(0, 0);
    },
    fechar() {
      telas.pop()?.remove();
      (telas.at(-1) ?? base).hidden = false;
    },
    // troca a tela de cima (ex.: depois de criar, abre o editor do que foi criado)
    trocar(tela: HTMLElement) {
      telas.pop()?.remove();
      telas.push(tela);
      base.parentElement?.append(tela);
    },
    fecharTodas() {
      while (telas.length) telas.pop()?.remove();
      base.hidden = false;
    },
    aberta: () => telas.length > 0,
  };
}
