// Coloca um arquivo (foto, PDF ou áudio) na prévia de anexo do próprio WhatsApp Web. Nunca envia:
// não aperta Enter, não clica em botão nenhum. Quem confere e envia, na prévia, é o dono.
//
// Como (pico técnico de 27/11/2026, ver extensao/README.md):
// 1) evento de colar na caixa de mensagem com o arquivo (como Ctrl+V de um print);
// 2) se a prévia não abriu, arrastar e soltar o arquivo na conversa (como arrastar da pasta).
// "Abriu" = a caixa de mensagem ficou coberta (a prévia do WhatsApp cobre a conversa) ou sumiu.
// Só olha a caixa de mensagem e o que está por cima dela; nunca lê as conversas.
import { acharCaixa } from "./inserir.ts";
import { deBase64, type ArquivoAnexo } from "./base64.ts";

export type ResultadoAnexo =
  | { ok: true; metodo: "colar" | "arrastar" }
  | { ok: false; motivo: "sem-conversa" | "layout" | "nao-abriu" };

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

async function abriu(doc: Document, caixaAntes: HTMLElement, ms: number): Promise<boolean> {
  // espera em passos curtos: a prévia aparece um pouco depois do evento
  const fim = Date.now() + ms;
  while (Date.now() < fim) {
    await esperar(100);
    const atual = acharCaixa(doc);
    if (!atual || atual !== caixaAntes || caixaCoberta(caixaAntes, doc)) return true;
  }
  return false;
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

  try {
    colar(caixa, arquivo);
  } catch {
    // navegador sem DataTransfer construível: segue para arrastar
  }
  // espera folgada: arrastar com a prévia já a caminho poria o arquivo duas vezes nela
  if (await abriu(doc, caixa, 2000)) return { ok: true, metodo: "colar" };

  try {
    await arrastar(doc, arquivo);
  } catch {
    return { ok: false, motivo: "nao-abriu" };
  }
  if (await abriu(doc, caixa, 2000)) return { ok: true, metodo: "arrastar" };
  return { ok: false, motivo: "nao-abriu" };
}

export function mensagemDeFalhaAnexo(motivo: "sem-conversa" | "layout" | "nao-abriu" | "sem-aba"): string {
  switch (motivo) {
    case "sem-conversa":
      return "Abra uma conversa no WhatsApp e tente de novo.";
    case "sem-aba":
      return "Abra o WhatsApp Web nesta janela e tente de novo.";
    case "layout":
      return "Não achei a conversa. O WhatsApp pode ter mudado. Use Baixar e arraste o arquivo para a conversa.";
    case "nao-abriu":
      return "A prévia do WhatsApp não abriu. Feche o que estiver aberto na conversa ou use Baixar e arraste o arquivo.";
  }
}
