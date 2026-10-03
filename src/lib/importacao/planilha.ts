import readXlsx from "read-excel-file/universal";
import { ErroDeLeitura } from "./tipos";
import type { Analise, ItemVendaLido, LancamentoLido, ProdutoLido, VendaLida } from "./tipos";
import { arredondar } from "./valores";

// Leitor de planilhas (CSV, Excel .xlsx). Roda no navegador (a planilha nem sai do aparelho
// até o usuário confirmar), por isso não tem limite de tamanho de envio. Cada aba vira uma prévia de produtos, vendas
// ou caixa, adivinhada pelos títulos das colunas. Daí em diante o fluxo é o mesmo do
// relatório em PDF: o usuário confere, corrige e confirma antes de qualquer gravação.

type Celula = string | number | boolean | Date | null | undefined;
type Tabela = Celula[][];

export type FormatoDeArquivo = "pdf" | "xlsx" | "xls" | "texto";

export function detectarFormato(dados: Uint8Array): FormatoDeArquivo {
  const inicio = String.fromCharCode(...dados.slice(0, 5));
  if (inicio === "%PDF-") return "pdf";
  if (inicio.startsWith("PK\u0003\u0004")) return "xlsx"; // .xlsx é um zip
  if (dados[0] === 0xd0 && dados[1] === 0xcf && dados[2] === 0x11 && dados[3] === 0xe0) return "xls"; // Excel antigo
  return "texto";
}

// ---------------------------------------------------------------------------
// arquivo -> tabela
// ---------------------------------------------------------------------------

function decodificar(dados: Uint8Array) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(dados);
  } catch {
    // CSV salvo pelo Excel brasileiro costuma vir em Windows-1252
    return new TextDecoder("windows-1252").decode(dados);
  }
}

function lerCsv(dados: Uint8Array): Tabela {
  const texto = decodificar(dados).replace(/^﻿/, "");
  const primeiras = texto.split(/\r?\n/).slice(0, 5).join("\n");
  const contar = (c: string) => primeiras.split(c).length - 1;
  const separador = ([";", "\t", ","] as const).reduce((melhor, c) => (contar(c) > contar(melhor) ? c : melhor), ",");

  const linhas: string[][] = [];
  let linha: string[] = [];
  let campo = "";
  let aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"' && texto[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (c === '"') {
        aspas = false;
      } else {
        campo += c;
      }
    } else if (c === '"') {
      aspas = true;
    } else if (c === separador) {
      linha.push(campo);
      campo = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = "";
    } else {
      campo += c;
    }
  }
  linha.push(campo);
  linhas.push(linha);
  return linhas;
}

async function lerAbas(dados: Uint8Array): Promise<{ nome: string; tabela: Tabela }[]> {
  const formato = detectarFormato(dados);
  if (formato === "xls") {
    throw new ErroDeLeitura('Este é um Excel antigo (.xls). Abra no Excel e use "Salvar como" .xlsx ou CSV.');
  }
  if (formato === "xlsx") {
    try {
      const abas = await readXlsx(new Blob([dados as BlobPart]));
      return abas.map((a) => ({ nome: a.sheet, tabela: a.data as Tabela }));
    } catch {
      throw new ErroDeLeitura("Não consegui abrir esta planilha. Ela pode estar protegida por senha ou corrompida.");
    }
  }
  return [{ nome: "", tabela: lerCsv(dados) }];
}

// ---------------------------------------------------------------------------
// valores
// ---------------------------------------------------------------------------

const vazio = (c: Celula) => c === null || c === undefined || (typeof c === "string" && c.trim() === "");

export function textoDe(c: Celula): string {
  if (vazio(c)) return "";
  if (c instanceof Date) return c.toISOString().slice(0, 10);
  return String(c).trim();
}

// "R$ 1.234,56", "1234,56", "1.234,56", "1234.56", "(10,00)", "-5"
export function numeroDe(c: Celula): number | null {
  if (typeof c === "number") return Number.isFinite(c) ? c : null;
  if (vazio(c) || typeof c !== "string") return null;
  let t = c.replace(/R\$|\s/g, "");
  const negativo = /^\(.*\)$/.test(t) || t.startsWith("-") || t.endsWith("-");
  t = t.replace(/[()\-]/g, "");
  if (!/^[\d.,]+$/.test(t)) return null;
  const ponto = t.lastIndexOf(".");
  const virgula = t.lastIndexOf(",");
  if (ponto >= 0 && virgula >= 0) {
    const decimal = ponto > virgula ? "." : ",";
    t = decimal === "," ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  } else if (virgula >= 0) {
    t = t.replace(/\./g, "").replace(",", ".");
  } else if (ponto >= 0 && /^\d{1,3}(\.\d{3})+$/.test(t)) {
    t = t.replace(/\./g, ""); // 1.234 é mil duzentos e trinta e quatro
  }
  const n = Number(t);
  return Number.isFinite(n) ? (negativo ? -n : n) : null;
}

function dataValida(a: number, m: number, d: number) {
  const data = new Date(Date.UTC(a, m - 1, d));
  return data.getUTCFullYear() === a && data.getUTCMonth() === m - 1 && data.getUTCDate() === d
    ? `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
    : null;
}

// "22/09/2026", "22/09/26", "22-09-2026", "2026-09-22", data do Excel ou número de série
export function dataDe(c: Celula): string | null {
  if (c instanceof Date) return Number.isNaN(c.getTime()) ? null : c.toISOString().slice(0, 10);
  if (typeof c === "number") {
    if (c < 20000 || c > 80000) return null;
    return new Date(Math.round((c - 25569) * 86400 * 1000)).toISOString().slice(0, 10);
  }
  const t = textoDe(c);
  let m = t.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return dataValida(Number(m[1]), Number(m[2]), Number(m[3]));
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})/);
  if (m) {
    const ano = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return dataValida(ano, Number(m[2]), Number(m[1]));
  }
  return null;
}

// ---------------------------------------------------------------------------
// colunas
// ---------------------------------------------------------------------------

function normalizar(t: string) {
  return t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// o título da coluna (já sem acento) precisa ser igual a um destes, ou começar por ele
const SINONIMOS = {
  nome: ["nome", "produto", "item", "descricao", "mercadoria", "titulo", "nome do produto", "descricao do produto"],
  categoria: ["categoria", "grupo", "departamento", "tipo de produto"],
  custo: ["custo", "preco de custo", "preco custo", "valor de custo", "custo unitario", "preco de compra", "valor de compra", "compra", "valor pago"],
  venda: ["preco", "preco de venda", "preco venda", "valor de venda", "preco varejo", "varejo", "valor", "venda", "valor unitario", "preco unitario"],
  atacado: ["atacado", "preco atacado", "preco de atacado", "valor atacado"],
  estoque: ["estoque", "quantidade em estoque", "quantidade", "qtd", "qtde", "saldo", "em estoque"],
  data: ["data", "data da venda", "data do lancamento", "dia", "quando", "data de pagamento", "data pagamento"],
  quantidade: ["quantidade", "qtd", "qtde", "unidades", "quantidade vendida"],
  total: ["total", "valor", "valor total", "total da venda", "valor da venda", "valor vendido", "vendido por", "valor recebido", "faturamento"],
  unitario: ["preco unitario", "valor unitario", "preco", "preco de venda", "valor de venda"],
  custoUnitario: ["custo", "custo unitario", "preco de custo", "valor de custo", "preco custo"],
  custoTotal: ["custo total", "total de custo", "custo da venda"],
  pedido: ["pedido", "numero do pedido", "no do pedido", "numero da venda", "n da venda", "id da venda", "venda n", "codigo da venda", "numero", "id"],
  cliente: ["cliente", "comprador", "nome do cliente", "nome do comprador"],
  forma: ["forma de pagamento", "forma pagamento", "pagamento", "forma de pgto", "pago com", "meio de pagamento"],
  canal: ["canal", "canal de venda", "origem", "plataforma", "onde vendeu", "vendido em"],
  descricaoCaixa: ["descricao", "historico", "lancamento", "detalhe", "detalhes", "observacao", "movimento"],
  valorCaixa: ["valor", "valor do lancamento", "total", "montante", "quantia"],
  tipoCaixa: ["tipo", "entrada saida", "natureza", "e s", "movimentacao", "tipo de lancamento", "operacao"],
  entrada: ["entrada", "entradas", "receita", "receitas", "credito", "creditos", "recebido"],
  saida: ["saida", "saidas", "despesa", "despesas", "debito", "debitos", "gasto", "gastos", "pago"],
  categoriaCaixa: ["categoria", "grupo", "classificacao"],
} as const;

type Campo = keyof typeof SINONIMOS;
type Colunas = Partial<Record<Campo, number>>;

// indica a posição de cada coluna reconhecida; cada coluna serve a um campo só
function mapear(titulos: string[], campos: readonly Campo[]): Colunas {
  const norm = titulos.map(normalizar);
  const usadas = new Set<number>();
  const resultado: Colunas = {};
  // primeiro os títulos idênticos, depois os que apenas começam pelo sinônimo
  for (const exato of [true, false]) {
    for (const campo of campos) {
      if (resultado[campo] !== undefined) continue;
      for (const sinonimo of SINONIMOS[campo]) {
        const i = norm.findIndex((t, idx) => !usadas.has(idx) && t !== "" && (exato ? t === sinonimo : t.startsWith(`${sinonimo} `)));
        if (i >= 0) {
          resultado[campo] = i;
          usadas.add(i);
          break;
        }
      }
    }
  }
  return resultado;
}

const CAMPOS_PRODUTO: readonly Campo[] = ["nome", "custo", "atacado", "venda", "estoque", "categoria"];
const CAMPOS_VENDA: readonly Campo[] = ["data", "pedido", "nome", "quantidade", "custoTotal", "custoUnitario", "total", "unitario", "cliente", "forma", "canal"];
const CAMPOS_CAIXA: readonly Campo[] = ["data", "descricaoCaixa", "entrada", "saida", "tipoCaixa", "valorCaixa", "categoriaCaixa"];

type Tipo = Analise["tipo"];

// acha a linha de títulos nas primeiras linhas (planilhas costumam ter título em cima)
function acharTitulos(tabela: Tabela): number {
  const limite = Math.min(tabela.length, 12);
  for (let i = 0; i < limite; i++) {
    const textos = tabela[i].map(textoDe).filter(Boolean);
    if (textos.length < 2) continue;
    const norm = textos.map(normalizar);
    const conhecidos = norm.filter((t) =>
      Object.values(SINONIMOS).some((lista) => (lista as readonly string[]).some((s) => t === s || t.startsWith(`${s} `))),
    );
    if (conhecidos.length >= 2) return i;
  }
  return -1;
}

function descobrirTipo(titulos: string[]): { tipo: Tipo; colunas: Colunas } | null {
  const vendas = mapear(titulos, CAMPOS_VENDA);
  const caixa = mapear(titulos, CAMPOS_CAIXA);
  const produtos = mapear(titulos, CAMPOS_PRODUTO);
  const temData = vendas.data !== undefined;
  const temValorDeVenda = vendas.total !== undefined || vendas.unitario !== undefined;
  const temEntradaSaida = caixa.tipoCaixa !== undefined || caixa.entrada !== undefined || caixa.saida !== undefined;

  // "Descrição" sozinha pode ser de venda ou de caixa; sinais de venda: produto, quantidade, cliente, pedido...
  const tituloDoNome = vendas.nome === undefined ? "" : normalizar(titulos[vendas.nome]);
  const pareceVenda =
    vendas.nome !== undefined &&
    (["produto", "item", "mercadoria", "nome do produto", "descricao do produto"].includes(tituloDoNome) ||
      vendas.quantidade !== undefined ||
      vendas.pedido !== undefined ||
      vendas.cliente !== undefined ||
      vendas.custoUnitario !== undefined ||
      vendas.custoTotal !== undefined);

  if (temData && pareceVenda && temValorDeVenda && !temEntradaSaida) return { tipo: "vendas", colunas: vendas };
  if (temData && caixa.descricaoCaixa !== undefined && (caixa.valorCaixa !== undefined || caixa.entrada !== undefined || caixa.saida !== undefined)) {
    return { tipo: "caixa", colunas: caixa };
  }
  if (temData && vendas.nome !== undefined && temValorDeVenda) return { tipo: "vendas", colunas: vendas };
  if (produtos.nome !== undefined && (produtos.venda !== undefined || produtos.custo !== undefined)) {
    return { tipo: "produtos", colunas: produtos };
  }
  return null;
}

// ---------------------------------------------------------------------------
// tabela -> prévia
// ---------------------------------------------------------------------------

function aba(rotulo: string, tabela: Tabela) {
  const inicio = acharTitulos(tabela);
  if (inicio < 0) return null;
  const titulos = tabela[inicio].map(textoDe);
  const achado = descobrirTipo(titulos);
  if (!achado) return null;
  const linhas = tabela.slice(inicio + 1).filter((l) => l.some((c) => !vazio(c)));
  return { rotulo, tipo: achado.tipo, colunas: achado.colunas, linhas };
}

function produtosDe(colunas: Colunas, linhas: Tabela): Analise {
  const itens: ProdutoLido[] = [];
  let semCusto = 0;
  for (const l of linhas) {
    const nome = textoDe(l[colunas.nome!]);
    if (!nome) continue;
    const custo = colunas.custo === undefined ? 0 : (numeroDe(l[colunas.custo]) ?? 0);
    const precoVarejo = colunas.venda === undefined ? 0 : (numeroDe(l[colunas.venda]) ?? 0);
    const atacado = colunas.atacado === undefined ? null : numeroDe(l[colunas.atacado]);
    const estoque = colunas.estoque === undefined ? 0 : Math.trunc(numeroDe(l[colunas.estoque]) ?? 0);
    const avisos: string[] = [];
    if (custo <= 0) {
      semCusto++;
      avisos.push("Sem custo: informe para o lucro sair certo.");
    }
    if (precoVarejo <= 0) avisos.push("Sem preço de venda.");
    itens.push({
      nome,
      categoria: colunas.categoria === undefined ? null : textoDe(l[colunas.categoria]) || null,
      custo: Math.max(arredondar(custo), 0),
      precoVarejo: Math.max(arredondar(precoVarejo), 0),
      precoAtacado: atacado && atacado > 0 ? arredondar(atacado) : null,
      estoque: Math.max(estoque, 0),
      avisos,
    });
  }
  const avisos: string[] = [];
  if (colunas.custo === undefined) avisos.push('A planilha não tem uma coluna de custo (ex.: "Custo"). Sem ela, o lucro dos produtos não é calculado.');
  else if (semCusto > 0) avisos.push(`${semCusto} produtos ficaram sem custo.`);
  if (colunas.estoque === undefined) avisos.push('Sem coluna de estoque (ex.: "Estoque"): os produtos entram com 0 unidades.');
  return { tipo: "produtos", origem: "planilha", periodo: null, avisos, conferencias: [], itens };
}

function vendasDe(colunas: Colunas, linhas: Tabela): Analise {
  const avisos: string[] = [];
  const ignoradas: string[] = [];
  type Linha = { data: string; nome: string; quantidade: number; total: number; custoUnitario: number; custoTotal: number | null; pedido: string; cliente: string | null; forma: string | null; canal: string | null };
  const lidas: Linha[] = [];

  linhas.forEach((l, i) => {
    const data = dataDe(l[colunas.data!]);
    const nome = textoDe(l[colunas.nome!]);
    const quantidade = Math.max(Math.trunc((colunas.quantidade === undefined ? 1 : numeroDe(l[colunas.quantidade])) ?? 1), 1);
    let total = colunas.total === undefined ? null : numeroDe(l[colunas.total]);
    if (total === null && colunas.unitario !== undefined) {
      const unitario = numeroDe(l[colunas.unitario]);
      if (unitario !== null) total = unitario * quantidade;
    }
    if (!data || !nome || total === null || total < 0) {
      ignoradas.push(`linha ${i + 2}`);
      return;
    }
    lidas.push({
      data,
      nome,
      quantidade,
      total: arredondar(total),
      custoUnitario: colunas.custoUnitario === undefined ? 0 : Math.max(numeroDe(l[colunas.custoUnitario]) ?? 0, 0),
      custoTotal: colunas.custoTotal === undefined ? null : numeroDe(l[colunas.custoTotal]),
      pedido: colunas.pedido === undefined ? "" : textoDe(l[colunas.pedido]),
      cliente: colunas.cliente === undefined ? null : textoDe(l[colunas.cliente]) || null,
      forma: colunas.forma === undefined ? null : textoDe(l[colunas.forma]) || null,
      canal: colunas.canal === undefined ? null : textoDe(l[colunas.canal]) || null,
    });
  });

  // linhas com o mesmo pedido viram uma venda só; sem coluna de pedido, cada linha é uma venda
  const vendas = new Map<string, VendaLida>();
  const repeticoes = new Map<string, number>();
  for (const l of lidas) {
    let chave: string;
    if (l.pedido) {
      chave = `pedido|${l.pedido}`;
    } else {
      // linhas idênticas continuam distintas, e a mesma planilha gera sempre a mesma referência
      const base = `${l.data}|${l.nome.slice(0, 60)}|${l.quantidade}|${l.total}|${(l.cliente ?? "").slice(0, 40)}`;
      const n = (repeticoes.get(base) ?? 0) + 1;
      repeticoes.set(base, n);
      chave = `linha|${base}|${n}`;
    }
    const item: ItemVendaLido = {
      nome: l.nome,
      nomeBase: l.nome,
      variacao: null,
      quantidade: l.quantidade,
      total: l.total,
      custoUnitario: arredondar(l.custoTotal !== null ? Math.max(l.custoTotal, 0) / l.quantidade : l.custoUnitario),
    };
    const existente = vendas.get(chave);
    if (existente) {
      existente.itens.push(item);
      existente.total = arredondar(existente.total + item.total);
      existente.custoTotal = arredondar(existente.custoTotal + item.custoUnitario * item.quantidade);
    } else {
      vendas.set(chave, {
        ref: `planilha|${chave}`.slice(0, 190),
        data: l.data,
        itens: [item],
        total: item.total,
        custoTotal: arredondar(item.custoUnitario * item.quantidade),
        formaPagamento: l.forma,
        canal: l.canal,
        cliente: l.cliente,
        aPrazo: false,
        avisos: [],
      });
    }
  }

  const itens = [...vendas.values()];
  if (colunas.custoUnitario === undefined && colunas.custoTotal === undefined) {
    avisos.push('A planilha não tem uma coluna de custo (ex.: "Custo"). Sem ela, o lucro dessas vendas fica igual ao valor vendido.');
  } else {
    const semCusto = itens.filter((v) => v.custoTotal <= 0).length;
    if (semCusto > 0) {
      for (const v of itens) if (v.custoTotal <= 0) v.avisos.push("Sem custo informado.");
    }
  }
  if (ignoradas.length > 0) {
    avisos.push(
      `${ignoradas.length} ${ignoradas.length === 1 ? "linha foi ignorada" : "linhas foram ignoradas"} por falta de data, produto ou valor (${ignoradas.slice(0, 5).join(", ")}${ignoradas.length > 5 ? "..." : ""}).`,
    );
  }
  const datas = itens.map((v) => v.data).sort();
  const periodo = datas.length ? `${datas[0].split("-").reverse().join("/")} a ${datas[datas.length - 1].split("-").reverse().join("/")}` : null;
  return { tipo: "vendas", origem: "planilha", periodo, avisos, conferencias: [], itens };
}

const ENTRADA = /^(entrada|receita|credito|recebimento|c|e|\+)$/;
const SAIDA = /^(saida|despesa|debito|pagamento|gasto|d|s|-)$/;

function caixaDe(colunas: Colunas, linhas: Tabela): Analise {
  const itens: LancamentoLido[] = [];
  const repeticoes = new Map<string, number>();
  const ignoradas: string[] = [];
  let vendasIgnoradas = 0;

  linhas.forEach((l, i) => {
    const data = dataDe(l[colunas.data!]);
    const descricao = textoDe(l[colunas.descricaoCaixa!]);
    if (!data || !descricao) {
      ignoradas.push(`linha ${i + 2}`);
      return;
    }
    let tipo: "entrada" | "saida" | null = null;
    let valor: number | null = null;
    if (colunas.entrada !== undefined || colunas.saida !== undefined) {
      const e = colunas.entrada === undefined ? null : numeroDe(l[colunas.entrada]);
      const s = colunas.saida === undefined ? null : numeroDe(l[colunas.saida]);
      if (e && e !== 0) {
        tipo = "entrada";
        valor = Math.abs(e);
      } else if (s && s !== 0) {
        tipo = "saida";
        valor = Math.abs(s);
      }
    } else if (colunas.valorCaixa !== undefined) {
      const v = numeroDe(l[colunas.valorCaixa]);
      if (v !== null && v !== 0) {
        const marca = colunas.tipoCaixa === undefined ? "" : normalizar(textoDe(l[colunas.tipoCaixa]));
        if (ENTRADA.test(marca) || marca.startsWith("entrada") || marca.startsWith("receita")) tipo = "entrada";
        else if (SAIDA.test(marca) || marca.startsWith("saida") || marca.startsWith("despesa")) tipo = "saida";
        else tipo = v < 0 ? "saida" : "entrada";
        valor = Math.abs(v);
      }
    }
    if (!tipo || !valor) {
      ignoradas.push(`linha ${i + 2}`);
      return;
    }
    // vendas já entram no caixa quando as vendas são importadas: contar de novo duplicaria
    if (tipo === "entrada" && /\bvenda/.test(normalizar(descricao))) {
      vendasIgnoradas++;
      return;
    }
    const base = `${data}|${tipo}|${valor}|${descricao.slice(0, 80)}`;
    const n = (repeticoes.get(base) ?? 0) + 1;
    repeticoes.set(base, n);
    itens.push({
      ref: `planilha|${base}|${n}`.slice(0, 190),
      data,
      tipo,
      origem: "manual",
      categoria: colunas.categoriaCaixa === undefined ? "Outros" : textoDe(l[colunas.categoriaCaixa]) || "Outros",
      descricao,
      valor: arredondar(valor),
      produtoNome: null,
    });
  });

  const avisos: string[] = [];
  if (vendasIgnoradas > 0) {
    avisos.push(`${vendasIgnoradas} entradas que parecem vendas ficaram de fora: as vendas importadas já entram no caixa.`);
  }
  if (ignoradas.length > 0) {
    avisos.push(
      `${ignoradas.length} ${ignoradas.length === 1 ? "linha foi ignorada" : "linhas foram ignoradas"} por falta de data, descrição ou valor (${ignoradas.slice(0, 5).join(", ")}${ignoradas.length > 5 ? "..." : ""}).`,
    );
  }
  const datas = itens.map((x) => x.data).sort();
  const periodo = datas.length ? `${datas[0].split("-").reverse().join("/")} a ${datas[datas.length - 1].split("-").reverse().join("/")}` : null;
  return { tipo: "caixa", origem: "planilha", periodo, avisos, conferencias: [], itens, vendasIgnoradas };
}

export const AJUDA_COLUNAS =
  "Use títulos de coluna como: Produtos (Nome, Custo, Preço, Estoque), Vendas (Data, Produto, Quantidade, Valor) ou Caixa (Data, Descrição, Valor, Tipo).";

// Lê o arquivo e devolve uma prévia por aba reconhecida.
export async function lerPlanilha(dados: Uint8Array): Promise<Analise[]> {
  const abas = await lerAbas(dados);
  const analises: Analise[] = [];
  const vistos = new Set<Tipo>();
  for (const { nome, tabela } of abas) {
    const a = aba(nome, tabela);
    if (!a || vistos.has(a.tipo)) continue;
    const analise =
      a.tipo === "produtos" ? produtosDe(a.colunas, a.linhas) : a.tipo === "vendas" ? vendasDe(a.colunas, a.linhas) : caixaDe(a.colunas, a.linhas);
    if (analise.itens.length === 0) continue;
    vistos.add(a.tipo);
    analises.push(analise);
  }
  if (analises.length === 0) {
    throw new ErroDeLeitura(`Não reconheci as colunas desta planilha. ${AJUDA_COLUNAS}`);
  }
  return analises;
}
