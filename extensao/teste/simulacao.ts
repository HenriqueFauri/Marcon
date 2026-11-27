// Página de simulação local: uma caixa contenteditable parecida com a do WhatsApp Web, para testar a
// inserção sem abrir o WhatsApp de verdade. Usa o mesmo inserirTexto do script da extensão.
// window.marcon expõe inserir() e estado() para o agente de teste.
import { formatarMensagem, type ProdutoBusca } from "../src/formatar.ts";
import { inserirTexto, mensagemDeFalha } from "../src/inserir.ts";
import { anexarArquivo, mensagemDeFalhaAnexo, montarArquivo } from "../src/anexar.ts";
import { paraBase64 } from "../src/base64.ts";
import { falarComPagina } from "../src/voz.ts";
import { paraOggOpus } from "../src/ogg-opus.ts";
import "../src/pagina.ts";

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

// ---------------------------------------------------------------------------------------------
// Prévia de anexo falsa (parte 3). Como no WhatsApp: colar ou soltar um arquivo na conversa abre
// uma prévia por cima, com legenda e botão Enviar. Só o clique no Enviar da prévia envia.
// Modos: "colar" (abre ao colar e ao soltar), "arrastar" (só ao soltar), "nenhum" (ignora arquivo),
// "recusa" (mostra por cima o aviso "não é compatível", sem prévia, como o WhatsApp fez com o M4A).
let modoAnexo = "colar";
const previa = document.getElementById("previa") as HTMLDivElement;
const previaNome = document.getElementById("previa-nome") as HTMLSpanElement;
let naPrevia: { nome: string; tipo: string; tamanho: number }[] = [];
let enviosDeArquivo = 0;

const recusa = document.getElementById("recusa") as HTMLDivElement;
let avisosDeRecusa = 0;
function abrirPrevia(arquivos: FileList | undefined | null) {
  const lista = [...(arquivos ?? [])];
  if (lista.length === 0) return false;
  if (modoAnexo === "recusa") {
    avisosDeRecusa++;
    recusa.hidden = false;
    return true;
  }
  naPrevia = [...naPrevia, ...lista.map((f) => ({ nome: f.name, tipo: f.type, tamanho: f.size }))];
  previaNome.textContent = naPrevia.map((a) => `${a.nome} (${a.tipo}, ${a.tamanho} bytes)`).join(" + ");
  previa.hidden = false;
  return true;
}
caixa.addEventListener(
  "paste",
  (e) => {
    if ((modoAnexo === "colar" || modoAnexo === "recusa") && e.clipboardData?.files.length) {
      e.stopImmediatePropagation();
      e.preventDefault();
      setTimeout(() => abrirPrevia(e.clipboardData?.files), 120);
    }
  },
  { capture: true },
);
main.addEventListener("dragover", (e) => modoAnexo !== "nenhum" && e.preventDefault());
main.addEventListener("drop", (e) => {
  if (modoAnexo === "nenhum") return;
  e.preventDefault();
  abrirPrevia(e.dataTransfer?.files);
});
document.getElementById("previa-enviar")!.addEventListener("click", () => {
  enviosDeArquivo += naPrevia.length;
  naPrevia = [];
  previa.hidden = true;
});
document.getElementById("previa-fechar")!.addEventListener("click", () => {
  naPrevia = [];
  previa.hidden = true;
  recusa.hidden = true;
});
document.getElementById("recusa-ok")!.addEventListener("click", () => (recusa.hidden = true));
document.querySelectorAll<HTMLInputElement>('input[name="anexo"]').forEach((r) =>
  r.addEventListener("change", () => r.checked && (modoAnexo = r.value)),
);

async function anexar(nome = "catalogo.pdf", mime = "application/pdf", tamanho = 2048) {
  const arquivo = montarArquivo({ base64: paraBase64(new Uint8Array(tamanho).fill(65)), mime, nome });
  const r = await anexarArquivo(arquivo);
  log.textContent = r.ok ? `anexo ok (${r.metodo})` : `anexo falhou: ${mensagemDeFalhaAnexo(r.motivo)}`;
  return r;
}
document.getElementById("anexar")!.addEventListener("click", () => anexar());

// ---------------------------------------------------------------------------------------------
// Áudio de voz: WPP falso no lugar da WA-JS e a mesma ponte (pagina.ts) da extensão. Conta os envios.
let conversaAtiva: { id: { _serialized: string }; formattedTitle: string } | undefined = { id: { _serialized: "5511999990000@c.us" }, formattedTitle: "Cliente Teste" };
const vozesEnviadas: { para: string; bytes: number; opcoes: Record<string, unknown> }[] = [];
(window as unknown as { WPP: unknown }).WPP = {
  isReady: true,
  chat: {
    getActiveChat: () => conversaAtiva,
    sendFileMessage: async (id: { _serialized: string }, conteudo: string, opcoes: Record<string, unknown>) => {
      await new Promise((r) => setTimeout(r, 200));
      vozesEnviadas.push({ para: id._serialized, bytes: atob(conteudo.split(",")[1]).length, opcoes });
      return { id: "msg" };
    },
  },
};

// o mesmo caminho do clique: pergunta a conversa e manda (a confirmação é do painel)
async function voz(base64 = paraBase64(new Uint8Array(500).fill(1)), trocarAntes?: string) {
  const c = await falarComPagina("conversa");
  if (!c.ok || !c.conversa) return { etapa: "conversa", ...c };
  if (trocarAntes !== undefined) (window as unknown as { marcon: { conversaFalsa(n: string): void } }).marcon.conversaFalsa(trocarAntes);
  const r = await falarComPagina("enviarVoz", { conversa: c.conversa.id, base64 }, 5000);
  return { etapa: "envio", conversa: c.conversa, ...r };
}

// WAV de teste (tom de 440 Hz) para conferir a conversão para OGG/Opus no navegador
function wav(segundos: number, taxa = 44100): ArrayBuffer {
  const n = Math.round(segundos * taxa);
  const b = new ArrayBuffer(44 + n * 2);
  const v = new DataView(b);
  const txt = (o: number, t: string) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  txt(0, "RIFF");
  v.setUint32(4, 36 + n * 2, true);
  txt(8, "WAVE");
  txt(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, taxa, true);
  v.setUint32(28, taxa * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  txt(36, "data");
  v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.round(Math.sin((2 * Math.PI * 440 * i) / taxa) * 12000), true);
  return b;
}

async function testeOpus(segundos = 4) {
  const { ogg, segundos: duracao } = await paraOggOpus(wav(segundos));
  const ctx = new OfflineAudioContext(1, 1, 48000);
  const volta = await ctx.decodeAudioData(ogg.slice().buffer);
  const cabecalho = String.fromCharCode(...ogg.subarray(0, 4)) + "|" + String.fromCharCode(...ogg.subarray(28, 36));
  return { bytes: ogg.length, duracao, decodificado: volta.duration, canais: volta.numberOfChannels, taxa: volta.sampleRate, cabecalho };
}

(window as unknown as { marcon: unknown }).marcon = {
  inserir,
  inserirTexto: inserirLivre,
  anexar,
  modo: aplicarModo,
  modoAnexo: (m: string) => (modoAnexo = m),
  fecharPrevia: () => document.getElementById("previa-fechar")!.click(),
  voz,
  conversaFalsa: (nome: string | null) => (conversaAtiva = nome ? { id: { _serialized: nome.length + "@c.us" }, formattedTitle: nome } : undefined),
  testeOpus,
  estado: () => ({ modo, modoAnexo, texto: caixa.innerText, envios, enviosDeArquivo, avisosDeRecusa, previaAberta: !previa.hidden, naPrevia, vozesEnviadas }),
};
