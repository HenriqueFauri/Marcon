// Coloca o texto na caixa de mensagem do WhatsApp Web. Nunca envia: não aperta Enter, não clica em
// botão nenhum. Só lê a caixa de mensagem (para confirmar que o texto entrou), nunca as conversas.

export type ResultadoInsercao =
  | { ok: true; metodo: "colar" | "digitar" }
  | { ok: false; motivo: "sem-conversa" | "layout" | "nao-entrou" };

// Do mais específico ao mais genérico. A busca de conversas fica em #side e nunca entra.
const SELETORES = [
  '#main footer div[contenteditable="true"][role="textbox"]',
  '#main footer [contenteditable="true"]',
  'footer div[contenteditable="true"][data-tab="10"]',
  '[data-marcon-caixa] [contenteditable="true"]', // página de simulação local
];

export function acharCaixa(doc: Document = document): HTMLElement | null {
  for (const s of SELETORES) {
    const el = doc.querySelector<HTMLElement>(s);
    if (el && !el.closest("#side")) return el;
  }
  return null;
}

function normalizar(t: string): string {
  return t.replace(/ /g, " ").replace(/\s+/g, " ").trim();
}

// Põe o cursor no fim do que já estiver escrito, para somar ao rascunho do dono em vez de apagar.
function cursorNoFim(el: HTMLElement) {
  const sel = el.ownerDocument.getSelection();
  if (!sel) return;
  const r = el.ownerDocument.createRange();
  r.selectNodeContents(el);
  r.collapse(false);
  sel.removeAllRanges();
  sel.addRange(r);
}

function entrou(el: HTMLElement, antes: string, texto: string): boolean {
  const depois = normalizar(el.textContent ?? "");
  const primeira = normalizar(texto.split("\n")[0] ?? "");
  return depois !== antes && depois.includes(primeira);
}

// O editor do WhatsApp atualiza a caixa depois do evento (fora do mesmo tique). Esperar antes de
// conferir evita cair no plano 2 e escrever o texto duas vezes.
function esperar(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function inserirTexto(texto: string, doc: Document = document): Promise<ResultadoInsercao> {
  const caixa = acharCaixa(doc);
  if (!caixa) {
    // #main é o painel da conversa aberta. Sem ele, o dono ainda não abriu uma conversa.
    const temConversa = doc.querySelector("#main") || doc.querySelector("[data-marcon-caixa]");
    return { ok: false, motivo: temConversa ? "layout" : "sem-conversa" };
  }

  caixa.focus();
  cursorNoFim(caixa);
  const antes = normalizar(caixa.textContent ?? "");
  // Já tem rascunho (ou outro produto inserido): começa em linha nova, para não grudar no link
  // nem quebrar o negrito.
  const separar = antes.length > 0;

  // 1) Evento de colar: o editor do WhatsApp trata as quebras de linha como no Ctrl+V.
  try {
    const dt = new DataTransfer();
    dt.setData("text/plain", separar ? `\n${texto}` : texto);
    caixa.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  } catch {
    // navegador sem DataTransfer construível: segue para o plano 2
  }
  await esperar(150);
  if (entrou(caixa, antes, texto)) return { ok: true, metodo: "colar" };
  // Algo mudou, mas não é o nosso texto: não escrever de novo por cima.
  if (normalizar(caixa.textContent ?? "") !== antes) return { ok: false, motivo: "nao-entrou" };

  // 2) Digitar: insertText linha a linha e quebra de linha sem Enter (Enter enviaria).
  caixa.focus();
  cursorNoFim(caixa);
  const linhas = texto.split("\n");
  linhas.forEach((linha, i) => {
    if (i > 0 || separar) doc.execCommand("insertLineBreak");
    if (linha) doc.execCommand("insertText", false, linha);
  });
  await esperar(60);
  if (entrou(caixa, antes, texto)) return { ok: true, metodo: "digitar" };

  return { ok: false, motivo: "nao-entrou" };
}

export function mensagemDeFalha(motivo: "sem-conversa" | "layout" | "nao-entrou" | "sem-aba"): string {
  switch (motivo) {
    case "sem-conversa":
      return "Abra uma conversa no WhatsApp e tente de novo.";
    case "sem-aba":
      return "Abra o WhatsApp Web nesta janela e tente de novo.";
    case "layout":
      return "Não achei a caixa de mensagem. O WhatsApp pode ter mudado. Use Copiar e cole na conversa.";
    case "nao-entrou":
      return "O texto não entrou na caixa. Use Copiar e cole na conversa.";
  }
}
