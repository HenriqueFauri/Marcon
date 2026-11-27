// Coloca um arquivo (foto ou PDF) na prévia de anexo do próprio WhatsApp Web. Nunca envia:
// não aperta Enter, não clica em botão nenhum. Quem confere e envia, na prévia, é o dono.
//
// Como (pico técnico de 27/11/2026 e teste do dono, ver extensao/README.md): UMA tentativa por clique.
// Foto: evento de colar na caixa de mensagem (como Ctrl+V de um print). PDF: soltar o arquivo na
// conversa (como arrastar da pasta). Nunca o outro caminho depois: o aviso de recusa do WhatsApp
// pode chegar atrasado, e a segunda tentativa mostraria o aviso de novo ou poria o arquivo duas vezes.
// "Abriu" = apareceu uma caixa de texto nova à vista fora da lista de conversas (a legenda da prévia).
// Caixa de mensagem coberta SEM legenda nova = o WhatsApp mostrou um aviso por cima (ex.: "arquivo
// não é compatível"): é recusa, e o arquivo não é tentado de novo pelo outro caminho.
// Só olha caixas de texto e o que está por cima da caixa de mensagem; nunca lê as conversas.
import { acharCaixa } from "./inserir.ts";
import { deBase64, type ArquivoAnexo } from "./base64.ts";

export type ResultadoAnexo =
  | { ok: true; metodo: "colar" | "arrastar" }
  | { ok: false; motivo: "sem-conversa" | "layout" | "nao-abriu" | "recusado" };

const ID_PAINEL = "marcon-painel-embutido";

function esperar(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function montarArquivo(a: ArquivoAnexo): File {
  return new File([deBase64(a.base64)], a.nome, { type: a.mime, lastModified: Date.now() });
}

// O que está desenhado no meio da caixa, sem contar o painel do Marcon embutido na página
function porCima(doc: Document, x: number, y: number): Element | null {
  const lista = typeof doc.elementsFromPoint === "function" ? doc.elementsFromPoint(x, y) : [doc.elementFromPoint(x, y)].filter(Boolean);
  return (lista as Element[]).find((el) => !el.closest(`#${ID_PAINEL}`)) ?? null;
}

// true quando a caixa de mensagem não está mais à vista: saiu da página, ficou sem tamanho ou tem
// outra coisa por cima no meio dela (a prévia de anexo)
export function caixaCoberta(caixa: HTMLElement, doc: Document = document): boolean {
  if (!caixa.isConnected) return true;
  const r = caixa.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return true;
  const el = porCima(doc, r.left + r.width / 2, r.top + r.height / 2);
  if (!el) return false;
  return !(el === caixa || caixa.contains(el) || el.contains(caixa));
}

// caixas de texto à vista fora da lista de conversas e do painel do Marcon
function caixasDeTexto(doc: Document): Set<Element> {
  const lista = doc.querySelectorAll('[contenteditable="true"], textarea');
  return new Set([...lista].filter((el) => !el.closest("#side") && !el.closest(`#${ID_PAINEL}`) && el.getClientRects().length > 0));
}

type Efeito = "abriu" | "recusado" | "nada";

// Espera em passos curtos o que o WhatsApp fez com o arquivo
async function efeito(doc: Document, caixa: HTMLElement, antes: Set<Element>, avisosAntes: number, ms: number): Promise<Efeito> {
  const fim = Date.now() + ms;
  let recusa = false;
  while (Date.now() < fim) {
    await esperar(100);
    for (const el of caixasDeTexto(doc)) if (!antes.has(el) && el !== caixa) return "abriu";
    // aviso novo (diálogo ou alerta) ou algo por cima da caixa sem legenda: recusa, por enquanto
    recusa = avisosNaTela(doc) > avisosAntes || caixaCoberta(caixa, doc);
  }
  return recusa ? "recusado" : "nada";
}

// quantos diálogos e alertas estão à vista (o aviso "não é compatível" do WhatsApp é um deles).
// Conta só; não lê o texto.
function avisosNaTela(doc: Document): number {
  return [...doc.querySelectorAll('[role="dialog"], [role="alert"], [role="alertdialog"]')].filter(
    (el) => !el.closest(`#${ID_PAINEL}`) && el.getClientRects().length > 0,
  ).length;
}

function colar(caixa: HTMLElement, arquivo: File) {
  const dt = new DataTransfer();
  dt.items.add(arquivo);
  caixa.focus();
  caixa.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
}

async function arrastar(doc: Document, arquivo: File) {
  const area = doc.querySelector<HTMLElement>("#main") ?? doc.querySelector<HTMLElement>("[data-marcon-caixa]");
  if (!area) return;
  const r = area.getBoundingClientRect();
  const x = r.left + r.width / 2;
  const y = r.top + r.height / 2;
  const evento = (tipo: string, alvo: Element) => {
    const dt = new DataTransfer();
    dt.items.add(arquivo);
    alvo.dispatchEvent(new DragEvent(tipo, { dataTransfer: dt, bubbles: true, cancelable: true, clientX: x, clientY: y }));
  };
  evento("dragenter", area);
  // o WhatsApp desenha a área de soltar depois do dragenter: soltar no que estiver no meio da conversa
  await esperar(120);
  const alvo = porCima(doc, x, y) ?? area;
  evento("dragover", alvo);
  evento("drop", alvo);
}

export async function anexarArquivo(arquivo: File, doc: Document = document): Promise<ResultadoAnexo> {
  const caixa = acharCaixa(doc);
  if (!caixa) {
    const temConversa = doc.querySelector("#main") || doc.querySelector("[data-marcon-caixa]");
    return { ok: false, motivo: temConversa ? "layout" : "sem-conversa" };
  }
  // caixa já coberta (outra prévia aberta, menu na frente): não dá para saber se abriu, não tenta
  if (caixaCoberta(caixa, doc)) return { ok: false, motivo: "nao-abriu" };

  const antes = caixasDeTexto(doc);
  const avisosAntes = avisosNaTela(doc);
  const metodo = arquivo.type.startsWith("image/") ? "colar" : "arrastar";
  try {
    if (metodo === "colar") colar(caixa, arquivo);
    else await arrastar(doc, arquivo);
  } catch {
    return { ok: false, motivo: "nao-abriu" };
  }
  const r = await efeito(doc, caixa, antes, avisosAntes, 4000);
  if (r === "abriu") return { ok: true, metodo };
  return { ok: false, motivo: r === "recusado" ? "recusado" : "nao-abriu" };
}

export function mensagemDeFalhaAnexo(motivo: "sem-conversa" | "layout" | "nao-abriu" | "recusado" | "sem-aba"): string {
  switch (motivo) {
    case "sem-conversa":
      return "Abra uma conversa no WhatsApp e tente de novo.";
    case "sem-aba":
      return "Abra o WhatsApp Web nesta janela e tente de novo.";
    case "layout":
      return "Não achei a conversa. O WhatsApp pode ter mudado. Use Baixar e arraste o arquivo para a conversa.";
    case "recusado":
      return "O WhatsApp recusou esse arquivo. Feche o aviso na conversa. Se quiser, use Baixar e anexe pelo clipe do WhatsApp.";
    case "nao-abriu":
      return "A prévia do WhatsApp não abriu. Feche o que estiver aberto na conversa ou use Baixar e anexe pelo clipe do WhatsApp.";
  }
}
