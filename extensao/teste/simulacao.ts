// Página de simulação local: uma caixa contenteditable parecida com a do WhatsApp Web, para testar a
// inserção sem abrir o WhatsApp de verdade. Usa o mesmo inserirTexto do script da extensão.
// window.marcon expõe inserir() e estado() para o agente de teste.
import { formatarMensagem, type ProdutoBusca } from "../src/formatar.ts";
import { inserirTexto, mensagemDeFalha } from "../src/inserir.ts";

const caixa = document.getElementById("caixa") as HTMLDivElement;
const main = document.getElementById("main") as HTMLDivElement;
const embrulho = document.querySelector("[data-marcon-caixa]") as HTMLDivElement;
const enviadas = document.getElementById("enviadas") as HTMLDivElement;
const log = document.getElementById("log") as HTMLDivElement;
let envios = 0;
let modo = "lexical";

function enviar() {
  const t = caixa.innerText.trim();
  if (!t) return;
  envios++;
  const d = document.createElement("div");
  d.className = "msg";
  d.textContent = t;
  enviadas.append(d);
  caixa.replaceChildren();
}

// Como no WhatsApp: Enter envia, Shift+Enter quebra a linha.
caixa.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    enviar();
  }
});
document.getElementById("enviar")!.addEventListener("click", enviar);

// Modo "editor com colar": trata o evento de colar sozinho e atualiza a caixa um tique depois,
// como o editor do WhatsApp faz.
caixa.addEventListener("paste", (e) => {
  if (modo !== "lexical") return;
  e.preventDefault();
  const texto = e.clipboardData?.getData("text/plain") ?? "";
  setTimeout(() => {
    texto.split("\n").forEach((linha, i) => {
      if (i > 0) caixa.append(document.createElement("br"));
      caixa.append(document.createTextNode(linha));
    });
  }, 30);
});

function aplicarModo(m: string) {
  modo = m;
  main.id = m === "sem-conversa" ? "" : "main";
  if (m === "sem-conversa") embrulho.removeAttribute("data-marcon-caixa");
  else embrulho.setAttribute("data-marcon-caixa", "");
  caixa.contentEditable = m === "layout" || m === "sem-conversa" ? "false" : "true";
  caixa.replaceChildren();
}
document.querySelectorAll<HTMLInputElement>('input[name="modo"]').forEach((r) =>
  r.addEventListener("change", () => r.checked && aplicarModo(r.value)),
);

const exemplo: ProdutoBusca = {
  id: "p1",
  nome: "Garrafa térmica 1L",
  marca: "Termolar",
  sku: "GT1",
  codigoBarras: null,
  preco: 49.9,
  estoque: 3,
  naVitrine: true,
  capa: null,
  link: "https://marcon-staging.vercel.app/loja/loja-de-teste?p=p1",
  variacoes: [
    { id: "v1", nome: "Preta", preco: 49.9, estoque: 2, sku: null },
    { id: "v2", nome: "Azul", preco: 54.9, estoque: 0, sku: null },
  ],
};

async function inserir(variacaoId?: string) {
  const texto = formatarMensagem(exemplo, variacaoId);
  const r = await inserirTexto(texto);
  log.textContent = r.ok ? `ok (${r.metodo})` : `falha: ${mensagemDeFalha(r.motivo)}`;
  return { ...r, texto };
}

// texto livre (resposta pronta já preenchida), pelo mesmo caminho do script da extensão
async function inserirLivre(texto: string) {
  const r = await inserirTexto(texto);
  log.textContent = r.ok ? `ok (${r.metodo})` : `falha: ${mensagemDeFalha(r.motivo)}`;
  return { ...r, texto };
}

document.getElementById("inserir")!.addEventListener("click", () => inserir());
document.getElementById("inserir-var")!.addEventListener("click", () => inserir("v2"));

(window as unknown as { marcon: unknown }).marcon = {
  inserir,
  inserirTexto: inserirLivre,
  modo: aplicarModo,
  estado: () => ({ modo, texto: caixa.innerText, envios }),
};
