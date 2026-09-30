// Transforma as linhas de uma planilha qualquer em vendas e produtos, a partir do que o
// usuário disse que é cada coluna. Nada aqui grava: o resultado vai para a mesma prévia
// dos relatórios em PDF, e de lá para as mesmas funções do banco.
import type { Analise, ItemVendaLido, ProdutoLido, VendaLida } from "../tipos";
import { arredondar } from "../valores";
import type { Aba, Celula } from "./ler";

export type Modo = "vendas" | "produtos";

export type CampoId =
  | "data"
  | "produto"
  | "quantidade"
  | "preco"
  | "total"
  | "custo"
  | "pagamento"
  | "canal"
  | "cliente"
  | "pedido"
  | "categoria"
  | "atacado"
  | "estoque";

export interface CampoDef {
  id: CampoId;
  rotulo: string;
  ajuda?: string;
  obrigatorio?: boolean;
  extra?: boolean; // pouco comum: fica em "Mais colunas"
  sinonimos: string[];
}

export type Mapa = Partial<Record<CampoId, number>>;

const NOME = ["produto", "produtos", "nome", "nome do produto", "descricao", "descricao do produto", "item", "mercadoria", "artigo", "modelo"];
const CUSTO = ["custo", "custo unitario", "custo unit", "preco de custo", "valor de custo", "custo do produto", "preco de compra", "valor de compra", "compra"];

export const CAMPOS: Record<Modo, CampoDef[]> = {
  vendas: [
    { id: "data", rotulo: "Data", obrigatorio: true, sinonimos: ["data", "data da venda", "data venda", "dia", "atualizacao", "emissao", "date"] },
    { id: "produto", rotulo: "Produto", obrigatorio: true, sinonimos: NOME },
    {
      id: "preco",
      rotulo: "Preço de venda (por unidade)",
      ajuda: "Informe este ou o total da linha.",
      sinonimos: ["venda", "preco", "preco de venda", "preco venda", "valor", "valor de venda", "valor da venda", "valor unitario", "preco unitario", "unitario", "vlr unit", "varejo"],
    },
    { id: "total", rotulo: "Total da linha", ajuda: "Preço × quantidade.", sinonimos: ["total", "valor total", "total da venda", "total venda", "subtotal", "vlr total"] },
    { id: "quantidade", rotulo: "Quantidade", ajuda: "Sem esta coluna, cada linha conta como 1.", sinonimos: ["qtd", "qtde", "qte", "quant", "quantidade", "unidades", "un"] },
    { id: "custo", rotulo: "Custo (por unidade)", ajuda: "Sem custo, o lucro da venda aparece como 100%.", sinonimos: CUSTO },
    { id: "pagamento", extra: true, rotulo: "Forma de pagamento", sinonimos: ["pagamento", "forma de pagamento", "forma pagamento", "meio de pagamento", "pgto", "forma"] },
    { id: "canal", extra: true, rotulo: "Canal", sinonimos: ["canal", "canal de venda", "onde vendeu", "plataforma", "loja"] },
    { id: "cliente", extra: true, rotulo: "Cliente", sinonimos: ["cliente", "nome do cliente", "comprador"] },
    {
      id: "pedido",
      extra: true,
      rotulo: "Número da venda",
      ajuda: "Linhas com o mesmo número viram uma venda só, com vários itens.",
      sinonimos: ["pedido", "n pedido", "numero do pedido", "numero da venda", "n venda", "venda n", "id venda", "codigo da venda", "cod venda"],
    },
  ],
  produtos: [
    { id: "produto", rotulo: "Nome do produto", obrigatorio: true, sinonimos: NOME },
    { id: "categoria", rotulo: "Categoria", sinonimos: ["categoria", "grupo", "tipo", "departamento", "secao", "linha"] },
    { id: "custo", rotulo: "Custo", sinonimos: CUSTO },
    {
      id: "preco",
      rotulo: "Preço de venda",
      sinonimos: ["venda", "preco", "preco de venda", "preco venda", "varejo", "preco varejo", "valor", "valor de venda", "preco unitario"],
    },
    { id: "atacado", extra: true, rotulo: "Preço de atacado", sinonimos: ["atacado", "preco atacado", "preco de atacado"] },
    { id: "estoque", rotulo: "Estoque", ajuda: "Sem esta coluna, o estoque entra zerado.", sinonimos: ["estoque", "estoque atual", "em estoque", "saldo", "qtd", "qtde", "quantidade", "disponivel"] },
  ],
};

// ---------------------------------------------------------------------------
// valores das células
// ---------------------------------------------------------------------------

export function normalizar(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/r\$/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// o mesmo produto escrito com espaço ou maiúscula diferente é o mesmo (como no banco)
export function chaveDoNome(nome: string) {
  return nome.replace(/\s+/g, " ").trim().toLowerCase();
}

// resto de fórmula com erro, quando o CSV traz o texto
const ERRO = /^#(DIV\/0!|N\/[AD]|REF!|VALUE!|VALOR!|NAME\?|NOME\?|NUM!|NULL!|NULO!)/i;

export function textoDaCelula(c: Celula | undefined): string {
  if (c == null) return "";
  if (typeof c === "number") return String(c);
  return ERRO.test(c) ? "" : c.replace(/\s+/g, " ").trim();
}

// "R$ 1.234,56", "1234,56", "1,234.56", "(12,00)", 12.5
export function lerNumero(c: Celula | undefined): number | null {
  if (c == null) return null;
  if (typeof c === "number") return Number.isFinite(c) ? c : null;
  let s = textoDaCelula(c).replace(/R\$|\s| /gi, "");
  if (!s || s.includes("%")) return null;
  let negativo = false;
  if (/^\(.*\)$/.test(s)) {
    negativo = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith("-")) {
    negativo = !negativo;
    s = s.slice(1);
  }
  const virgula = s.lastIndexOf(",");
  const ponto = s.lastIndexOf(".");
  if (virgula >= 0 && ponto >= 0) {
    // o último separador é o decimal
    s = virgula > ponto ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (virgula >= 0) {
    s = (s.match(/,/g)?.length ?? 0) > 1 ? s.replace(/,/g, "") : s.replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, ""); // "1.500" em planilha brasileira é mil e quinhentos
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return negativo ? -n : n;
}

function dataValida(a: number, m: number, d: number) {
  const data = new Date(Date.UTC(a, m - 1, d));
  if (data.getUTCFullYear() !== a || data.getUTCMonth() !== m - 1 || data.getUTCDate() !== d) return null;
  if (a < 1990 || a > 2100) return null;
  return data.toISOString().slice(0, 10);
}

// "2026-09-22" (já convertida), "22/09/2026", "22/09/26", "22-9-2026", número de série do Excel
export function lerDataDaCelula(c: Celula | undefined): string | null {
  if (c == null) return null;
  if (typeof c === "number") {
    if (c < 30000 || c > 80000) return null; // série do Excel entre 1982 e 2119
    return new Date(Date.UTC(1899, 11, 30) + Math.floor(c) * 86400000).toISOString().slice(0, 10);
  }
  const s = textoDaCelula(c);
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return dataValida(Number(m[1]), Number(m[2]), Number(m[3]));
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})(?!\d)/);
  if (m) {
    const ano = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return dataValida(ano, Number(m[2]), Number(m[1]));
  }
  return null;
}

// ---------------------------------------------------------------------------
// cabeçalho e colunas
// ---------------------------------------------------------------------------

const TODOS_SINONIMOS = new Set([...CAMPOS.vendas, ...CAMPOS.produtos].flatMap((c) => c.sinonimos));

function pareceTitulo(c: Celula | undefined) {
  return typeof c === "string" && TODOS_SINONIMOS.has(normalizar(c));
}

// a linha com mais títulos conhecidos entre as primeiras; senão, a primeira com texto
export function acharCabecalho(linhas: Celula[][]): number {
  let melhor = -1;
  let maior = 0;
  for (let i = 0; i < Math.min(linhas.length, 30); i++) {
    const n = linhas[i].filter(pareceTitulo).length;
    if (n > maior) {
      maior = n;
      melhor = i;
    }
  }
  if (melhor >= 0) return melhor;
  const primeira = linhas.findIndex((l) => l.filter((c) => typeof c === "string").length >= 2);
  return primeira >= 0 ? primeira : 0;
}

export function letraDaColuna(i: number) {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

// como o usuário está acostumado a ver: 22/09/2026, 70,28
export function exemploDaCelula(c: Celula | undefined) {
  if (typeof c === "number") return c.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  const t = textoDaCelula(c);
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? formatarData(t) : t;
}

export interface Coluna {
  indice: number;
  titulo: string;
  exemplo: string | null;
}

export function colunasDe(linhas: Celula[][], cabecalho: number): Coluna[] {
  const titulos = linhas[cabecalho] ?? [];
  const largura = Math.max(titulos.length, ...linhas.slice(cabecalho + 1, cabecalho + 200).map((l) => l.length));
  const colunas: Coluna[] = [];
  for (let i = 0; i < largura; i++) {
    const titulo = textoDaCelula(titulos[i]);
    let exemplo: string | null = null;
    for (const l of linhas.slice(cabecalho + 1)) {
      const t = exemploDaCelula(l[i]);
      if (t && t !== titulo) {
        exemplo = t.length > 28 ? `${t.slice(0, 27)}…` : t;
        break;
      }
    }
    // coluna sem título e sem nada embaixo é só espaço vazio da planilha
    if (!titulo && !exemplo) continue;
    colunas.push({ indice: i, titulo: titulo || `Coluna ${letraDaColuna(i)}`, exemplo });
  }
  return colunas;
}

export function mapearSozinho(colunas: Coluna[], modo: Modo): Mapa {
  const mapa: Mapa = {};
  const usadas = new Set<number>();
  // primeiro os títulos idênticos a um sinônimo, depois os que começam com um ("Preço de venda (R$)")
  for (const exato of [true, false]) {
    for (const campo of CAMPOS[modo]) {
      if (mapa[campo.id] !== undefined) continue;
      const col = colunas.find((c) => {
        if (usadas.has(c.indice)) return false;
        const t = normalizar(c.titulo);
        return campo.sinonimos.some((s) => (exato ? t === s : t.startsWith(`${s} `)));
      });
      if (col) {
        mapa[campo.id] = col.indice;
        usadas.add(col.indice);
      }
    }
  }
  return mapa;
}

// com data e sem uma coluna de estoque, é um registro de vendas ("Qtd" sozinha não conta como estoque)
export function adivinharModo(colunas: Coluna[]): Modo {
  const temData = mapearSozinho(colunas, "vendas").data !== undefined;
  const temEstoque = colunas.some((c) => /^(estoque|saldo|em estoque|disponivel)\b/.test(normalizar(c.titulo)));
  return temData && !temEstoque ? "vendas" : "produtos";
}

export function camposQueFaltam(modo: Modo, mapa: Mapa): string[] {
  const faltam = CAMPOS[modo].filter((c) => c.obrigatorio && mapa[c.id] === undefined).map((c) => c.rotulo);
  if (modo === "vendas" && mapa.preco === undefined && mapa.total === undefined) faltam.push("Preço de venda ou total");
  return faltam;
}

// ---------------------------------------------------------------------------
// montagem
// ---------------------------------------------------------------------------

export interface NomeEncontrado {
  chave: string;
  nome: string;
  vezes: number;
}

export interface Pulo {
  motivo: string;
  linhas: number[]; // números como aparecem na planilha (1 = primeira)
}

export interface Leitura {
  produtos: Extract<Analise, { tipo: "produtos" }>;
  vendas: Extract<Analise, { tipo: "vendas" }> | null;
  nomes: NomeEncontrado[];
  aproveitadas: number;
  puladas: Pulo[];
}

interface LinhaLida {
  numero: number;
  original: string; // nome como está na planilha
  chaveOriginal: string;
  nome: string;
  data: string | null;
  quantidade: number;
  preco: number | null;
  total: number | null;
  custo: number | null;
  atacado: number | null;
  estoque: number | null;
  categoria: string;
  pagamento: string;
  canal: string;
  cliente: string;
  pedido: string;
}

function formatarData(iso: string) {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

function plural(n: number, um: string, varios: string) {
  return `${n} ${n === 1 ? um : varios}`;
}

export function montar(aba: Aba, cabecalho: number, modo: Modo, mapa: Mapa, renomes: Record<string, string> = {}): Leitura {
  const titulos = (aba.linhas[cabecalho] ?? []).map((c) => normalizar(textoDaCelula(c)));
  const colunasUsadas = Object.values(mapa).filter((i): i is number => i !== undefined);
  const pulos = new Map<string, number[]>();
  const pular = (motivo: string, numero: number) => {
    const lista = pulos.get(motivo) ?? [];
    lista.push(numero);
    pulos.set(motivo, lista);
  };
  const cel = (linha: Celula[], campo: CampoId) => (mapa[campo] === undefined ? undefined : linha[mapa[campo]!]);

  const lidas: LinhaLida[] = [];
  aba.linhas.forEach((linha, i) => {
    if (i <= cabecalho) return;
    const numero = i + 1;
    // linha totalmente em branco (comum no fim da planilha) nem conta como pulada
    if (linha.every((c) => c == null || c === "")) return;
    const preenchidas = colunasUsadas.filter((c) => textoDaCelula(linha[c]) !== "");
    if (preenchidas.length === 0) {
      pular("vazia ou com erro de fórmula (#DIV/0!)", numero);
      return;
    }
    // o cabeçalho repetido no meio da planilha (a cada página impressa, por exemplo)
    const iguaisAoTitulo = colunasUsadas.filter((c) => titulos[c] && normalizar(textoDaCelula(linha[c])) === titulos[c]).length;
    if (iguaisAoTitulo >= Math.min(2, colunasUsadas.length)) {
      pular("cabeçalho repetido", numero);
      return;
    }
    const original = textoDaCelula(cel(linha, "produto"));
    if (!original) {
      pular("sem nome do produto", numero);
      return;
    }
    const chaveOriginal = chaveDoNome(original);
    const nome = (renomes[chaveOriginal] ?? "").trim() || original;
    const qtd = lerNumero(cel(linha, "quantidade"));
    lidas.push({
      numero,
      original,
      chaveOriginal,
      nome,
      data: lerDataDaCelula(cel(linha, "data")),
      quantidade: qtd == null ? 1 : qtd,
      preco: lerNumero(cel(linha, "preco")),
      total: lerNumero(cel(linha, "total")),
      custo: lerNumero(cel(linha, "custo")),
      atacado: lerNumero(cel(linha, "atacado")),
      estoque: lerNumero(cel(linha, "estoque")),
      categoria: textoDaCelula(cel(linha, "categoria")),
      pagamento: textoDaCelula(cel(linha, "pagamento")),
      canal: textoDaCelula(cel(linha, "canal")),
      cliente: textoDaCelula(cel(linha, "cliente")),
      pedido: textoDaCelula(cel(linha, "pedido")),
    });
  });

  // nomes como aparecem na planilha, para o usuário juntar os que são o mesmo produto
  const contagem = new Map<string, NomeEncontrado>();
  for (const l of lidas) {
    const n = contagem.get(l.chaveOriginal);
    if (n) n.vezes++;
    else contagem.set(l.chaveOriginal, { chave: l.chaveOriginal, nome: l.original, vezes: 1 });
  }
  const nomes = [...contagem.values()].sort((a, b) => a.chave.localeCompare(b.chave, "pt-BR"));

  let vendas: Leitura["vendas"] = null;
  let aproveitadas = lidas.length;
  let base: LinhaLida[] = lidas;

  if (modo === "vendas") {
    const validas: LinhaLida[] = [];
    for (const l of lidas) {
      if (!l.data) pular("sem data válida", l.numero);
      else if (!Number.isInteger(l.quantidade) || l.quantidade <= 0) pular("quantidade inválida", l.numero);
      else if (l.total == null && l.preco == null) pular("sem valor de venda", l.numero);
      else if ((l.total ?? l.preco ?? 0) < 0 || (l.custo ?? 0) < 0) pular("com valor negativo", l.numero);
      else validas.push(l);
    }
    vendas = montarVendas(validas);
    aproveitadas = validas.length;
    base = validas;
  }

  const produtos = montarProdutos(base, modo);
  const puladas = [...pulos.entries()].map(([motivo, linhas]) => ({ motivo, linhas }));
  const totalPuladas = puladas.reduce((s, p) => s + p.linhas.length, 0);
  const resumo =
    `Li ${plural(aproveitadas + totalPuladas, "linha", "linhas")} da aba “${aba.nome}”` +
    (totalPuladas ? `: ${plural(aproveitadas, "aproveitada", "aproveitadas")} e ${plural(totalPuladas, "pulada", "puladas")} (${puladas.map((p) => `${p.motivo}: ${p.linhas.length}`).join("; ")}).` : ".");

  // o resumo aparece uma vez só: na seção de vendas quando há vendas, senão na de produtos
  if (vendas) vendas.resumo = resumo;
  else produtos.resumo = resumo;
  return { produtos, vendas, nomes, aproveitadas, puladas };
}

function montarVendas(linhas: LinhaLida[]): Extract<Analise, { tipo: "vendas" }> {
  // com número da venda, as linhas iguais viram uma venda com vários itens; sem, cada linha é uma venda
  const grupos = new Map<string, LinhaLida[]>();
  const repeticoes = new Map<string, number>();
  for (const l of linhas) {
    let ref: string;
    if (l.pedido) ref = `pedido:${l.pedido}|${l.data}`;
    else {
      // referência estável: a mesma linha importada de novo (ou a planilha com linhas novas no fim) não duplica
      const base = `${l.data}|${l.chaveOriginal}|${l.quantidade}|${l.total ?? ""}|${l.preco ?? ""}|${l.custo ?? ""}`;
      const n = (repeticoes.get(base) ?? 0) + 1;
      repeticoes.set(base, n);
      ref = `${base}|${n}`;
    }
    const g = grupos.get(ref);
    if (g) g.push(l);
    else grupos.set(ref, [l]);
  }

  const itens: VendaLida[] = [];
  for (const [ref, grupo] of grupos) {
    const avisos: string[] = [];
    const itensDaVenda: ItemVendaLido[] = grupo.map((l) => {
      const total = arredondar(l.total ?? (l.preco ?? 0) * l.quantidade);
      return { nome: l.nome, nomeBase: l.nome, variacao: null, quantidade: l.quantidade, total, custoUnitario: arredondar(l.custo ?? 0) };
    });
    if (grupo.some((l) => l.custo == null)) avisos.push("Sem custo na planilha: o lucro desta venda vai aparecer como 100%.");
    const primeira = grupo[0];
    itens.push({
      ref,
      data: primeira.data!,
      itens: itensDaVenda,
      total: arredondar(itensDaVenda.reduce((s, i) => s + i.total, 0)),
      custoTotal: arredondar(itensDaVenda.reduce((s, i) => s + i.custoUnitario * i.quantidade, 0)),
      formaPagamento: primeira.pagamento || null,
      canal: primeira.canal || null,
      cliente: primeira.cliente || null,
      aPrazo: false,
      avisos,
    });
  }
  itens.sort((a, b) => a.data.localeCompare(b.data));

  const datas = itens.map((v) => v.data);
  const periodo = datas.length ? `${formatarData(datas[0])} a ${formatarData(datas[datas.length - 1])}` : null;
  const avisos: string[] = [];
  const semCusto = itens.filter((v) => v.avisos.length).length;
  if (semCusto) avisos.push(`${plural(semCusto, "venda está", "vendas estão")} sem custo na planilha e vão entrar com custo zero.`);
  return { tipo: "vendas", origem: "planilha", periodo, avisos, conferencias: [], itens };
}

// um produto por nome; quando o nome aparece em várias linhas, valem os valores da mais recente
function montarProdutos(linhas: LinhaLida[], modo: Modo): Extract<Analise, { tipo: "produtos" }> {
  const ordenadas = [...linhas].sort((a, b) => (a.data ?? "").localeCompare(b.data ?? "") || a.numero - b.numero);
  const porNome = new Map<string, LinhaLida[]>();
  for (const l of ordenadas) {
    const chave = chaveDoNome(l.nome);
    porNome.set(chave, [...(porNome.get(chave) ?? []), l]);
  }

  const itens: ProdutoLido[] = [];
  for (const grupo of porNome.values()) {
    const ultima = grupo[grupo.length - 1];
    const ultimo = <T>(f: (l: LinhaLida) => T | null) => {
      for (let i = grupo.length - 1; i >= 0; i--) {
        const v = f(grupo[i]);
        if (v != null && v !== "") return v;
      }
      return null;
    };
    const avisos: string[] = [];
    const custo = ultimo((l) => (l.custo != null && l.custo > 0 ? l.custo : null));
    const preco =
      modo === "vendas"
        ? ultimo((l) => (l.preco != null ? l.preco : l.total != null && l.quantidade > 0 ? l.total / l.quantidade : null))
        : ultimo((l) => l.preco);
    if (custo == null) avisos.push("Sem custo na planilha.");
    if (grupo.length > 1 && modo === "produtos") avisos.push(`Aparece ${grupo.length} vezes na planilha: usei os valores da última linha (${ultima.numero}).`);
    const estoque = modo === "produtos" ? ultimo((l) => l.estoque) : null;
    itens.push({
      nome: ultima.nome,
      categoria: ultimo((l) => l.categoria || null),
      custo: arredondar(Math.max(custo ?? 0, 0)),
      precoVarejo: arredondar(Math.max(preco ?? 0, 0)),
      precoAtacado: ultimo((l) => (l.atacado != null && l.atacado > 0 ? arredondar(l.atacado) : null)),
      estoque: Math.max(Math.trunc(estoque ?? 0), 0),
      avisos,
    });
  }
  itens.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  const avisos: string[] = [];
  if (modo === "vendas") {
    avisos.push("Os produtos saem das vendas da planilha, com o custo e o preço da venda mais recente. O estoque entra zerado, porque a planilha não diz quanto sobrou: ajuste aqui ou depois, no cadastro.");
  }
  return { tipo: "produtos", origem: "planilha", periodo: null, avisos, conferencias: [], itens };
}

// ---------------------------------------------------------------------------
// nomes parecidos
// ---------------------------------------------------------------------------

function distancia(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 2) return 3;
  let anterior = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const atual = [i];
    for (let j = 1; j <= b.length; j++) {
      atual[j] = Math.min(anterior[j] + 1, atual[j - 1] + 1, anterior[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    anterior = atual;
  }
  return anterior[b.length];
}

// para cada nome, outro que talvez seja o mesmo produto ("Torneira" e "Torneira Banheiro", "Fone KZ" e "Fone Kz")
export function nomesParecidos(nomes: NomeEncontrado[]): Map<string, string> {
  const r = new Map<string, string>();
  if (nomes.length > 800) return r;
  const chaves = nomes.map((n) => ({ ...n, simples: normalizar(n.nome) }));
  for (let i = 0; i < chaves.length; i++) {
    for (let j = i + 1; j < chaves.length; j++) {
      const a = chaves[i].simples;
      const b = chaves[j].simples;
      const parecido =
        a === b || b.startsWith(`${a} `) || a.startsWith(`${b} `) || (Math.min(a.length, b.length) >= 6 && distancia(a, b) <= 2);
      if (!parecido) continue;
      if (!r.has(chaves[i].chave)) r.set(chaves[i].chave, chaves[j].nome);
      if (!r.has(chaves[j].chave)) r.set(chaves[j].chave, chaves[i].nome);
    }
  }
  return r;
}
