import { getDocumentProxy } from "unpdf";
import { agruparLinhas } from "./tabela";
import { ErroDeLeitura, type Item, type Pagina } from "./tipos";

const MAX_PAGINAS = 80;

// extrai o texto de cada página com a posição de cada trecho
export async function lerPdf(dados: Uint8Array): Promise<Pagina[]> {
  let pdf;
  try {
    pdf = await getDocumentProxy(dados);
  } catch {
    throw new ErroDeLeitura("Não consegui abrir este arquivo. Ele é mesmo um PDF?");
  }
  if (pdf.numPages > MAX_PAGINAS) {
    throw new ErroDeLeitura(`O PDF tem ${pdf.numPages} páginas; o limite é ${MAX_PAGINAS}. Exporte um período menor.`);
  }

  const paginas: Pagina[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const conteudo = await (await pdf.getPage(n)).getTextContent();
    const itens: Item[] = [];
    for (const it of conteudo.items) {
      if ("str" in it && it.str.trim()) itens.push({ x: it.transform[4], y: it.transform[5], texto: it.str.trim() });
    }
    paginas.push(agruparLinhas(itens));
  }
  return paginas;
}
