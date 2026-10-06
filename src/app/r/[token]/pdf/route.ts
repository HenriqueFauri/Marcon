import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatBRL, formatData, formatarTelefone } from "@/lib/format";
import { rotuloDocumento } from "@/lib/documento";
import { buscarRecibo, totaisDoRecibo } from "@/lib/recibo";

// Recibo em PDF para baixar: mesmo conteúdo da página pública /r/[token], sem login.

const A4: [number, number] = [595.28, 841.89];
const MARGEM = 50;
const INK = rgb(0.1, 0.1, 0.12);
const MUTED = rgb(0.4, 0.4, 0.44);
const LINHA = rgb(0.86, 0.86, 0.88);

const STATUS_PARCELA = { pendente: "A vencer", pago: "Paga", atrasado: "Atrasada" } as const;

// as fontes padrão do PDF só cobrem Latin-1: troca o que não cabe
function seguro(texto: string) {
  return texto
    .replace(/[−–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "");
}

function quebrar(texto: string, fonte: PDFFont, tamanho: number, largura: number) {
  const linhas: string[] = [];
  let atual = "";
  for (const palavra of seguro(texto).split(" ")) {
    const teste = atual ? `${atual} ${palavra}` : palavra;
    if (fonte.widthOfTextAtSize(teste, tamanho) <= largura || !atual) atual = teste;
    else {
      linhas.push(atual);
      atual = palavra;
    }
  }
  if (atual) linhas.push(atual);
  return linhas;
}

async function carregarLogo(pdf: PDFDocument, path: string | null): Promise<PDFImage | null> {
  if (!path) return null;
  try {
    const admin = createAdminClient();
    if (!admin) return null;
    const { data } = await admin.storage.from("logo-empresa").createSignedUrl(path, 60);
    if (!data?.signedUrl) return null;
    const resposta = await fetch(data.signedUrl);
    if (!resposta.ok) return null;
    const bytes = new Uint8Array(await resposta.arrayBuffer());
    if (bytes[0] === 0x89 && bytes[1] === 0x50) return await pdf.embedPng(bytes);
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return await pdf.embedJpg(bytes);
    return null; // webp e outros formatos: o PDF sai sem o logo
  } catch {
    return null;
  }
}

export async function GET(_req: Request, ctx: RouteContext<"/r/[token]/pdf">) {
  const { token } = await ctx.params;
  const recibo = await buscarRecibo(token);
  if (!recibo) return new Response("Recibo não encontrado", { status: 404 });
  const { empresa, venda, itens, parcelas } = recibo;
  const { subtotal, emAberto } = totaisDoRecibo(recibo);
  const cancelada = venda.status === "cancelada";

  const pdf = await PDFDocument.create();
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const negrito = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = await carregarLogo(pdf, empresa.logo_path);
  const largura = A4[0] - MARGEM * 2;

  let page: PDFPage = pdf.addPage(A4);
  let y = A4[1] - MARGEM;

  const garantir = (altura: number) => {
    if (y - altura >= MARGEM) return;
    page = pdf.addPage(A4);
    y = A4[1] - MARGEM;
  };
  const texto = (t: string, x: number, tamanho: number, fonte = normal, cor = INK) =>
    page.drawText(seguro(t), { x, y, size: tamanho, font: fonte, color: cor });
  const direita = (t: string, tamanho: number, fonte = normal, cor = INK) =>
    page.drawText(seguro(t), {
      x: MARGEM + largura - fonte.widthOfTextAtSize(seguro(t), tamanho),
      y,
      size: tamanho,
      font: fonte,
      color: cor,
    });
  const regua = () => {
    page.drawLine({ start: { x: MARGEM, y }, end: { x: MARGEM + largura, y }, thickness: 0.6, color: LINHA });
  };

  // cabeçalho: logo + dados da empresa
  let xTexto = MARGEM;
  if (logo) {
    const lado = 56;
    const escala = Math.min(lado / logo.width, lado / logo.height);
    const w = logo.width * escala;
    const h = logo.height * escala;
    page.drawImage(logo, { x: MARGEM, y: y - h, width: w, height: h });
    xTexto = MARGEM + lado + 14;
  }
  const topo = y;
  y -= 16;
  texto(empresa.nome || "Recibo de venda", xTexto, 16, negrito);
  const telefone = formatarTelefone(empresa.telefone);
  const dados = [
    rotuloDocumento(empresa.documento),
    telefone ? `Telefone ${telefone}` : null,
    empresa.email,
    ...(empresa.endereco ? quebrar(empresa.endereco, normal, 9, largura - (xTexto - MARGEM)) : []),
  ].filter((d): d is string => Boolean(d));
  for (const d of dados) {
    y -= 12;
    texto(d, xTexto, 9, normal, MUTED);
  }
  y = Math.min(y, topo - 56) - 14;
  regua();

  // título e cliente
  y -= 26;
  texto("RECIBO", MARGEM, 12, negrito, MUTED);
  direita(formatData(venda.data), 10, normal, MUTED);
  if (venda.cliente_nome) {
    y -= 16;
    texto(`Cliente: ${venda.cliente_nome}`, MARGEM, 10);
  }
  if (cancelada) {
    y -= 20;
    texto("Esta venda foi cancelada.", MARGEM, 10, negrito, rgb(0.75, 0.15, 0.15));
  }

  // itens
  y -= 14;
  for (const item of itens) {
    garantir(40);
    y -= 14;
    regua();
    y -= 16;
    const nomeLinhas = quebrar(item.nome, normal, 10, largura - 110);
    nomeLinhas.forEach((linha, i) => {
      if (i > 0) y -= 13;
      texto(linha, MARGEM, 10);
    });
    direita(formatBRL(item.quantidade * Number(item.preco_unitario)), 10);
    y -= 12;
    texto(`${item.quantidade} x ${formatBRL(item.preco_unitario)}`, MARGEM, 9, normal, MUTED);
  }
  y -= 10;
  regua();

  // totais
  garantir(100);
  if (Number(venda.desconto) > 0) {
    y -= 16;
    texto("Subtotal", MARGEM, 10, normal, MUTED);
    direita(formatBRL(subtotal), 10, normal, MUTED);
    y -= 14;
    texto("Desconto", MARGEM, 10, normal, MUTED);
    direita(`- ${formatBRL(venda.desconto)}`, 10, normal, MUTED);
  }
  y -= 20;
  texto("Total", MARGEM, 13, negrito);
  direita(formatBRL(venda.valor_total), 13, negrito);
  y -= 16;
  texto("Pagamento", MARGEM, 10, normal, MUTED);
  direita([venda.tipo_pagamento === "a_prazo" ? "A prazo" : "À vista", venda.forma_pagamento].filter(Boolean).join(" - "), 10, normal, MUTED);

  // parcelas
  if (parcelas.length > 0) {
    garantir(70);
    y -= 32;
    texto("Parcelas", MARGEM, 12, negrito);
    if (!cancelada) direita(emAberto > 0 ? `${formatBRL(emAberto)} em aberto` : "Tudo pago", 9, normal, MUTED);
    for (const p of parcelas) {
      garantir(34);
      y -= 12;
      regua();
      y -= 16;
      texto(`${p.numero}/${parcelas.length} - ${formatBRL(p.valor)}`, MARGEM, 10);
      if (!cancelada) direita(STATUS_PARCELA[p.status], 10, negrito, MUTED);
      y -= 12;
      texto(p.data_pagamento ? `paga em ${formatData(p.data_pagamento)}` : `vence em ${formatData(p.vencimento)}`, MARGEM, 9, normal, MUTED);
    }
    y -= 10;
    regua();
    y -= 14;
    texto("Situação das parcelas na data em que este PDF foi gerado. A página do recibo mostra a situação atualizada.", MARGEM, 8, normal, MUTED);
  }

  const bytes = await pdf.save();
  const arquivo = `recibo-${venda.data}.pdf`;
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${arquivo}"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
