import { PDFDocument, StandardFonts, rgb, type PDFPage } from "pdf-lib";
import { createClient } from "@/lib/supabase/server";
import { formatBRL, mesAtual, mesValido, nomeDoMes } from "@/lib/format";
import { fechamentoDoMes } from "@/lib/fechamento";
import { formatPct, margem, variacao } from "@/lib/relatorios";

// Fechamento do mês em PDF, para guardar ou mandar ao contador. Só de quem está logado (RLS).

const A4: [number, number] = [595.28, 841.89];
const MARGEM = 50;
const INK = rgb(0.1, 0.1, 0.12);
const MUTED = rgb(0.4, 0.4, 0.44);
const LINHA = rgb(0.86, 0.86, 0.88);

// as fontes padrão do PDF só cobrem Latin-1
function seguro(texto: string) {
  return texto
    .replace(/[−–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "");
}

function textoVariacao(atual: number, anterior: number) {
  const v = variacao(atual, anterior);
  if (v === null) return "sem base";
  if (Math.abs(v) < 0.05) return "igual";
  return `${v > 0 ? "+" : "-"}${formatPct(Math.abs(v))}`;
}

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return new Response("Entre na sua conta para baixar o fechamento.", { status: 401 });

  const mes = mesValido(new URL(req.url).searchParams.get("mes")) ?? mesAtual();
  let dados;
  try {
    dados = await fechamentoDoMes(supabase, mes);
  } catch {
    return new Response("Não foi possível montar o fechamento agora.", { status: 500 });
  }
  const { atual, anterior } = dados;
  const negocio = (auth.user.user_metadata?.nome_negocio as string | undefined) || "Meu negócio";

  const pdf = await PDFDocument.create();
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const negrito = await pdf.embedFont(StandardFonts.HelveticaBold);
  const largura = A4[0] - MARGEM * 2;
  const colAtual = MARGEM + largura - 110;
  const colVar = MARGEM + largura;

  let page: PDFPage = pdf.addPage(A4);
  let y = A4[1] - MARGEM;
  const garantir = (altura: number) => {
    if (y - altura >= MARGEM) return;
    page = pdf.addPage(A4);
    y = A4[1] - MARGEM;
  };
  const texto = (t: string, x: number, tamanho: number, fonte = normal, cor = INK) =>
    page.drawText(seguro(t), { x, y, size: tamanho, font: fonte, color: cor });
  const alinhadoDireita = (t: string, xFim: number, tamanho: number, fonte = normal, cor = INK) =>
    page.drawText(seguro(t), { x: xFim - fonte.widthOfTextAtSize(seguro(t), tamanho), y, size: tamanho, font: fonte, color: cor });
  const regua = () => page.drawLine({ start: { x: MARGEM, y }, end: { x: MARGEM + largura, y }, thickness: 0.6, color: LINHA });

  y -= 16;
  texto(negocio, MARGEM, 16, negrito);
  y -= 18;
  texto(`Fechamento de ${nomeDoMes(mes)}`, MARGEM, 12, normal, MUTED);
  y -= 14;
  regua();

  // resumo
  const resultado = atual.entradas - atual.saidas;
  const resultadoAnterior = anterior.entradas - anterior.saidas;
  const ticket = atual.vendas.vendas > 0 ? atual.vendas.receita / atual.vendas.vendas : 0;
  const ticketAnterior = anterior.vendas.vendas > 0 ? anterior.vendas.receita / anterior.vendas.vendas : 0;

  y -= 26;
  texto("Resumo", MARGEM, 12, negrito);
  alinhadoDireita(nomeDoMes(mes), colAtual, 9, negrito, MUTED);
  alinhadoDireita(`vs ${nomeDoMes(anterior.mes)}`, colVar, 9, normal, MUTED);

  const linhas: [string, string, number, number, boolean?][] = [
    ["Vendido", formatBRL(atual.vendas.receita), atual.vendas.receita, anterior.vendas.receita],
    ["Vendas feitas", String(atual.vendas.vendas), atual.vendas.vendas, anterior.vendas.vendas],
    ["Ticket medio", formatBRL(ticket), ticket, ticketAnterior],
    ["Lucro", formatBRL(atual.vendas.lucro), atual.vendas.lucro, anterior.vendas.lucro],
    ["Margem de lucro", formatPct(margem(atual.vendas.lucro, atual.vendas.receita)), 0, 0],
    ["Entrou no caixa", formatBRL(atual.entradas), atual.entradas, anterior.entradas],
    ["Saiu do caixa", formatBRL(atual.saidas), atual.saidas, anterior.saidas],
    ["Resultado do caixa", formatBRL(resultado), resultado, resultadoAnterior],
  ];
  for (const [rotulo, valor, a, b] of linhas) {
    y -= 10;
    regua();
    y -= 16;
    texto(rotulo, MARGEM, 10);
    alinhadoDireita(valor, colAtual, 10, negrito);
    if (rotulo !== "Margem de lucro") alinhadoDireita(textoVariacao(a, b), colVar, 9, normal, MUTED);
  }
  y -= 10;
  regua();

  // gastos por categoria
  y -= 30;
  garantir(60);
  texto("Gastos por categoria", MARGEM, 12, negrito);
  const totalGastos = atual.gastos.reduce((s, g) => s + g.valor, 0);
  if (atual.gastos.length === 0) {
    y -= 20;
    texto("Nenhuma saida de caixa nesse mes.", MARGEM, 10, normal, MUTED);
  }
  for (const g of atual.gastos) {
    garantir(34);
    y -= 10;
    regua();
    y -= 16;
    const antes = anterior.gastos.find((a) => a.categoria === g.categoria)?.valor ?? 0;
    texto(g.categoria, MARGEM, 10);
    alinhadoDireita(formatBRL(g.valor), colAtual, 10, negrito);
    alinhadoDireita(textoVariacao(g.valor, antes), colVar, 9, normal, MUTED);
    y -= 12;
    texto(`${formatPct(totalGastos > 0 ? (g.valor / totalGastos) * 100 : 0)} dos gastos`, MARGEM, 8, normal, MUTED);
  }
  if (atual.gastos.length > 0) {
    y -= 10;
    regua();
    y -= 16;
    texto("Total de saidas", MARGEM, 10, negrito);
    alinhadoDireita(formatBRL(totalGastos), colAtual, 10, negrito);
  }

  garantir(50);
  y -= 34;
  texto("Lucro: vendido menos o custo dos produtos e os outros gastos das vendas. O caixa inclui compras de estoque e lancamentos manuais.", MARGEM, 7.5, normal, MUTED);

  const bytes = await pdf.save();
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="fechamento-${mes}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
