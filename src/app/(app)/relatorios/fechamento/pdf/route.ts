import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { createClient } from "@/lib/supabase/server";
import { formatBRL, formatData, hojeISO, mesAtual, mesValido, nomeDoMes } from "@/lib/format";
import { fechamentoDoMes } from "@/lib/fechamento";
import { formatPct, margem, ticketMedio, variacao } from "@/lib/relatorios";

// Fechamento do mês em PDF, para guardar ou mandar ao contador. Só de quem está logado (RLS).
// Mesmos dados da tela: números de destaque contra o mês anterior, dia a dia, caixa, gastos e produtos.

const A4: [number, number] = [595.28, 841.89];
const MARGEM = 40;
const INK = rgb(0.11, 0.11, 0.12);
const MUTED = rgb(0.39, 0.39, 0.4);
const LINHA = rgb(0.85, 0.85, 0.87);
const CARTAO = rgb(0.955, 0.955, 0.965);
const TRILHO = rgb(0.9, 0.9, 0.92);
const MARCA = rgb(0.83, 0.37, 0.19);
const MARCA_CLARA = rgb(0.95, 0.77, 0.68);
const AZUL = rgb(0.04, 0.4, 0.84);
const VERDE = rgb(0.12, 0.48, 0.3);
const VERMELHO = rgb(0.72, 0.2, 0.16);

// as fontes padrão do PDF só cobrem Latin-1
function seguro(texto: string) {
  return texto
    .replace(/[−–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "");
}

function textoVariacao(atual: number, anterior: number, pontos = false) {
  const v = pontos ? atual - anterior : variacao(atual, anterior);
  if (v === null) return atual > 0 ? "novo" : "sem base";
  if (Math.abs(v) < 0.05) return "igual";
  const n = pontos ? `${Math.abs(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} pp` : formatPct(Math.abs(v));
  return `${v > 0 ? "+" : "-"}${n}`;
}

function corVariacao(atual: number, anterior: number, subirEhBom = true, pontos = false) {
  const v = pontos ? atual - anterior : variacao(atual, anterior);
  if (v === null || Math.abs(v) < 0.05) return MUTED;
  return v > 0 === subirEhBom ? VERDE : VERMELHO;
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
  const direita = MARGEM + largura;

  let page: PDFPage = pdf.addPage(A4);
  let y = A4[1] - MARGEM;
  const garantir = (altura: number) => {
    if (y - altura >= MARGEM + 20) return;
    page = pdf.addPage(A4);
    y = A4[1] - MARGEM;
  };
  const largTexto = (t: string, tamanho: number, fonte: PDFFont) => fonte.widthOfTextAtSize(seguro(t), tamanho);
  const texto = (t: string, x: number, tamanho: number, fonte = normal, cor = INK) =>
    page.drawText(seguro(t), { x, y, size: tamanho, font: fonte, color: cor });
  const aDireita = (t: string, xFim: number, tamanho: number, fonte = normal, cor = INK) =>
    page.drawText(seguro(t), { x: xFim - largTexto(t, tamanho, fonte), y, size: tamanho, font: fonte, color: cor });
  const cortar = (t: string, max: number, tamanho: number, fonte = normal) => {
    let s = seguro(t);
    if (fonte.widthOfTextAtSize(s, tamanho) <= max) return s;
    while (s.length > 1 && fonte.widthOfTextAtSize(`${s}...`, tamanho) > max) s = s.slice(0, -1);
    return `${s.trimEnd()}...`;
  };
  const regua = () => page.drawLine({ start: { x: MARGEM, y }, end: { x: direita, y }, thickness: 0.5, color: LINHA });
  const titulo = (t: string) => {
    garantir(40);
    y -= 30;
    texto(t.toUpperCase(), MARGEM, 8.5, negrito, MUTED);
    y -= 8;
  };

  // ---- cabeçalho
  page.drawRectangle({ x: 0, y: A4[1] - 8, width: A4[0], height: 8, color: MARCA });
  y -= 22;
  texto(negocio, MARGEM, 18, negrito);
  aDireita(`Gerado em ${formatData(hojeISO())}`, direita, 9, normal, MUTED);
  y -= 20;
  texto(`Fechamento de ${nomeDoMes(mes)}`, MARGEM, 12, normal, MUTED);
  aDireita(`comparado a ${nomeDoMes(anterior.mes)}`, direita, 9, normal, MUTED);

  // ---- números de destaque (2 fileiras de 3)
  const resultado = atual.entradas - atual.saidas;
  const resultadoAnterior = anterior.entradas - anterior.saidas;
  const mg = margem(atual.vendas.lucro, atual.vendas.receita);
  const mgAnt = margem(anterior.vendas.lucro, anterior.vendas.receita);
  const cartoes: { rotulo: string; valor: string; a: number; b: number; pontos?: boolean; cor?: ReturnType<typeof rgb> }[] = [
    { rotulo: "Faturamento", valor: formatBRL(atual.vendas.receita), a: atual.vendas.receita, b: anterior.vendas.receita },
    { rotulo: "Lucro", valor: formatBRL(atual.vendas.lucro), a: atual.vendas.lucro, b: anterior.vendas.lucro, cor: atual.vendas.lucro < 0 ? VERMELHO : VERDE },
    { rotulo: "Margem", valor: formatPct(mg), a: mg, b: mgAnt, pontos: true },
    { rotulo: "Ticket médio", valor: formatBRL(ticketMedio(atual.vendas)), a: ticketMedio(atual.vendas), b: ticketMedio(anterior.vendas) },
    { rotulo: "Vendas feitas", valor: String(atual.vendas.vendas), a: atual.vendas.vendas, b: anterior.vendas.vendas },
    { rotulo: "Resultado do caixa", valor: formatBRL(resultado), a: resultado, b: resultadoAnterior, cor: resultado < 0 ? VERMELHO : undefined },
  ];
  const folga = 10;
  const larguraCartao = (largura - folga * 2) / 3;
  const alturaCartao = 58;
  y -= 24;
  for (let i = 0; i < cartoes.length; i += 3) {
    const topo = y;
    cartoes.slice(i, i + 3).forEach((c, k) => {
      const x = MARGEM + k * (larguraCartao + folga);
      page.drawRectangle({ x, y: topo - alturaCartao, width: larguraCartao, height: alturaCartao, color: CARTAO });
      y = topo - 16;
      texto(c.rotulo, x + 10, 8.5, normal, MUTED);
      y = topo - 33;
      texto(c.valor, x + 10, 15, negrito, c.cor ?? INK);
      y = topo - 47;
      texto(`${textoVariacao(c.a, c.b, c.pontos)} vs mês anterior`, x + 10, 8, normal, corVariacao(c.a, c.b, true, c.pontos));
    });
    y = topo - alturaCartao - folga;
  }

  // ---- dia a dia: faturamento (barra clara) e lucro (barra cheia)
  titulo("Dia a dia");
  const alturaGrafico = 90;
  const pontos = atual.dias;
  const maxV = Math.max(0, ...pontos.map((p) => Math.max(p.faturamento, p.lucro)));
  const minV = Math.min(0, ...pontos.map((p) => p.lucro));
  const faixa = maxV - minV || 1;
  garantir(alturaGrafico + 40);
  const base = y - alturaGrafico; // fundo do gráfico
  const yDe = (v: number) => base + ((v - minV) / faixa) * alturaGrafico;
  const larguraColuna = largura / pontos.length;
  page.drawLine({ start: { x: MARGEM, y: yDe(0) }, end: { x: direita, y: yDe(0) }, thickness: 0.6, color: LINHA });
  pontos.forEach((p, i) => {
    const x = MARGEM + i * larguraColuna;
    const miolo = Math.max(larguraColuna - 2, 1);
    if (p.faturamento > 0) page.drawRectangle({ x: x + 1, y: yDe(0), width: miolo, height: (p.faturamento / faixa) * alturaGrafico, color: MARCA_CLARA });
    if (p.lucro !== 0) {
      const h = (Math.abs(p.lucro) / faixa) * alturaGrafico;
      page.drawRectangle({ x: x + 1 + miolo * 0.2, y: p.lucro > 0 ? yDe(0) : yDe(p.lucro), width: miolo * 0.6, height: h, color: p.lucro > 0 ? MARCA : VERMELHO });
    }
  });
  y = base - 11;
  const passo = pontos.length > 16 ? 5 : 1;
  pontos.forEach((p, i) => {
    if (i % passo !== 0 && i !== pontos.length - 1) return;
    const x = MARGEM + i * larguraColuna + larguraColuna / 2 - largTexto(p.rotulo, 7, normal) / 2;
    texto(p.rotulo, x, 7, normal, MUTED);
  });
  // escala do eixo e legenda
  y = base + alturaGrafico + 2;
  texto(`máx. ${formatBRL(maxV)}`, MARGEM, 7, normal, MUTED);
  y = base - 24;
  page.drawRectangle({ x: MARGEM, y: y - 1, width: 8, height: 8, color: MARCA_CLARA });
  texto("Vendido", MARGEM + 12, 8, normal, MUTED);
  page.drawRectangle({ x: MARGEM + 62, y: y - 1, width: 8, height: 8, color: MARCA });
  texto("Lucro", MARGEM + 74, 8, normal, MUTED);

  // ---- caixa
  titulo("Entradas e saídas do caixa");
  const maiorCaixa = Math.max(atual.entradas, atual.saidas, 1);
  const barra = (rotulo: string, valor: number, anteriorValor: number, cor: ReturnType<typeof rgb>, subirEhBom: boolean) => {
    garantir(36);
    y -= 14;
    texto(rotulo, MARGEM, 10);
    aDireita(formatBRL(valor), direita - 70, 10, negrito);
    aDireita(textoVariacao(valor, anteriorValor), direita, 9, normal, corVariacao(valor, anteriorValor, subirEhBom));
    y -= 12;
    page.drawRectangle({ x: MARGEM, y, width: largura, height: 6, color: TRILHO });
    if (valor > 0) page.drawRectangle({ x: MARGEM, y, width: Math.max((valor / maiorCaixa) * largura, 2), height: 6, color: cor });
    y -= 6;
  };
  barra("Entrou", atual.entradas, anterior.entradas, AZUL, true);
  barra("Saiu", atual.saidas, anterior.saidas, MARCA, false);
  y -= 16;
  texto(resultado >= 0 ? "Sobrou no mês" : "Faltou no mês", MARGEM, 10, negrito);
  aDireita(formatBRL(Math.abs(resultado)), direita, 10, negrito, resultado >= 0 ? VERDE : VERMELHO);

  // ---- gastos por categoria
  titulo("Gastos por categoria");
  const totalGastos = atual.gastos.reduce((s, g) => s + g.valor, 0);
  if (atual.gastos.length === 0) {
    y -= 12;
    texto("Nenhuma saída de caixa nesse mês.", MARGEM, 10, normal, MUTED);
    y -= 4;
  }
  for (const g of atual.gastos) {
    garantir(38);
    const antes = anterior.gastos.find((a) => a.categoria === g.categoria)?.valor ?? 0;
    y -= 14;
    texto(cortar(g.categoria, 230, 10), MARGEM, 10);
    aDireita(formatBRL(g.valor), direita - 120, 10, negrito);
    aDireita(formatPct(totalGastos > 0 ? (g.valor / totalGastos) * 100 : 0), direita - 70, 9, normal, MUTED);
    aDireita(textoVariacao(g.valor, antes), direita, 9, normal, corVariacao(g.valor, antes, false));
    y -= 11;
    page.drawRectangle({ x: MARGEM, y, width: largura, height: 4, color: TRILHO });
    page.drawRectangle({ x: MARGEM, y, width: Math.max((totalGastos > 0 ? g.valor / totalGastos : 0) * largura, 2), height: 4, color: MARCA });
    y -= 4;
  }
  if (atual.gastos.length > 0) {
    y -= 8;
    regua();
    y -= 14;
    texto("Total de saídas", MARGEM, 10, negrito);
    aDireita(formatBRL(totalGastos), direita - 120, 10, negrito);
  }

  // ---- produtos que mais renderam
  if (atual.maisLucrativos.length > 0) {
    titulo("Produtos que mais renderam");
    const maiorLucro = Math.max(atual.maisLucrativos[0].lucro, 1);
    for (const p of atual.maisLucrativos) {
      garantir(38);
      y -= 14;
      texto(cortar(p.nome, 270, 10), MARGEM, 10);
      aDireita(`${p.quantidade} un`, direita - 130, 9, normal, MUTED);
      aDireita(`margem ${formatPct(p.margem)}`, direita - 70, 9, normal, MUTED);
      aDireita(formatBRL(p.lucro), direita, 10, negrito, p.lucro < 0 ? VERMELHO : INK);
      y -= 11;
      page.drawRectangle({ x: MARGEM, y, width: largura, height: 4, color: TRILHO });
      if (p.lucro > 0) page.drawRectangle({ x: MARGEM, y, width: Math.max((p.lucro / maiorLucro) * largura, 2), height: 4, color: VERDE });
      y -= 4;
    }
  }

  // ---- mês contra mês
  titulo(`${nomeDoMes(mes)} contra ${nomeDoMes(anterior.mes)}`);
  const colAnterior = direita - 90;
  const colAtual = direita - 170;
  garantir(30);
  y -= 6;
  aDireita(nomeDoMes(mes), colAtual + 20, 8.5, negrito, MUTED);
  aDireita(nomeDoMes(anterior.mes), colAnterior + 20, 8.5, normal, MUTED);
  aDireita("variação", direita, 8.5, normal, MUTED);
  const linhas: [string, string, string, number, number, boolean?][] = [
    ["Vendido", formatBRL(atual.vendas.receita), formatBRL(anterior.vendas.receita), atual.vendas.receita, anterior.vendas.receita],
    ["Vendas feitas", String(atual.vendas.vendas), String(anterior.vendas.vendas), atual.vendas.vendas, anterior.vendas.vendas],
    ["Ticket médio", formatBRL(ticketMedio(atual.vendas)), formatBRL(ticketMedio(anterior.vendas)), ticketMedio(atual.vendas), ticketMedio(anterior.vendas)],
    ["Lucro", formatBRL(atual.vendas.lucro), formatBRL(anterior.vendas.lucro), atual.vendas.lucro, anterior.vendas.lucro],
    ["Entrou no caixa", formatBRL(atual.entradas), formatBRL(anterior.entradas), atual.entradas, anterior.entradas],
    ["Saiu do caixa", formatBRL(atual.saidas), formatBRL(anterior.saidas), atual.saidas, anterior.saidas, false],
    ["Resultado do caixa", formatBRL(resultado), formatBRL(resultadoAnterior), resultado, resultadoAnterior],
  ];
  for (const [rotulo, valor, antes, a, b, subirEhBom] of linhas) {
    garantir(24);
    y -= 8;
    regua();
    y -= 14;
    texto(rotulo, MARGEM, 10);
    aDireita(valor, colAtual + 20, 10, negrito);
    aDireita(antes, colAnterior + 20, 10, normal, MUTED);
    aDireita(textoVariacao(a, b), direita, 9, normal, corVariacao(a, b, subirEhBom ?? true));
  }

  garantir(40);
  y -= 30;
  texto("Lucro: vendido menos o custo dos produtos e os outros gastos das vendas. O caixa inclui compras de estoque e lançamentos manuais.", MARGEM, 7, normal, MUTED);

  // rodapé em todas as páginas
  const paginas = pdf.getPages();
  paginas.forEach((p, i) => {
    const t = seguro(`Marcon · ${negocio} · página ${i + 1} de ${paginas.length}`);
    p.drawText(t, { x: MARGEM, y: 24, size: 7, font: normal, color: MUTED });
  });

  const bytes = await pdf.save();
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="fechamento-${mes}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
