// Painel do Marcon (painel lateral do navegador ou embutido no WhatsApp). Tela simples em DOM puro:
// todo texto vindo do banco entra por textContent, nunca como HTML.
import { AMBIENTE } from "./config.ts";
import { estoqueTotal, formatarMensagem, formatarPreco, type ProdutoBusca } from "./formatar.ts";
import { pedir, type Sessao } from "./mensagens.ts";

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
function avisar(texto: string, erro = false) {
  if (!avisoEl) return;
  avisoEl.textContent = texto;
  avisoEl.className = erro ? "aviso erro" : "aviso";
  avisoEl.hidden = false;
  clearTimeout(avisoTimer);
  avisoTimer = window.setTimeout(() => avisoEl && (avisoEl.hidden = true), erro ? 6000 : 3000);
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
  const texto = () => formatarMensagem(p, variacaoId);
  const alvo = variacaoId ? `${p.nome} ${p.variacoes.find((v) => v.id === variacaoId)?.nome ?? ""}`.trim() : p.nome;
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
        on: { click: async () => avisar((await copiar(texto())) ? "Texto copiado." : "Não deu para copiar.", false) },
      },
      "Copiar",
    ),
  );
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
      variacoes,
    ),
  );
}

function telaPrincipal(sessao: Sessao) {
  const campo = h("input", {
    type: "search",
    placeholder: "Nome, SKU, marca ou código",
    "aria-label": "Buscar produto",
    autocomplete: "off",
  });
  const lupa = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  lupa.setAttribute("width", "18");
  lupa.setAttribute("height", "18");
  lupa.setAttribute("viewBox", "0 0 24 24");
  lupa.setAttribute("fill", "none");
  lupa.setAttribute("stroke", "currentColor");
  lupa.setAttribute("stroke-width", "2.2");
  lupa.setAttribute("stroke-linecap", "round");
  lupa.innerHTML = '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>';

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
      h("p", { class: "grupo-rodape" }, "Inserir coloca o texto na conversa aberta. Quem envia é você."),
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
      class: "texto-perigo",
      type: "button",
      on: {
        click: async () => {
          await pedir({ tipo: "sair" });
          telaEntrar();
        },
      },
    },
    "Sair",
  );

  app.replaceChildren(
    topo(),
    h("div", { class: "busca" }, lupa, campo),
    resultados,
    grupo("Conta", h("div", { class: "linha detalhe" }, sessao.email)),
    h("div", {}, sair),
    avisoEl,
  );
  campo.focus();
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
