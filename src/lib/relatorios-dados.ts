import type { SupabaseClient } from "@supabase/supabase-js";
import { hojeISO, somarDias } from "@/lib/format";
import {
  diasEntre,
  margem,
  paginar,
  serieEvolucao,
  totaisDeVendas,
  vendasConcluidas,
  type Intervalo,
  type PeriodoRelatorio,
} from "@/lib/relatorios";

// Tudo que a página de Relatórios lê do banco. Cada consulta é paginada (o PostgREST corta em
// 1000 linhas) e roda com a sessão de quem está logado, então a RLS por owner_id vale.

// ---------------------------------------------------------------------------
// produtos vendidos no período
// ---------------------------------------------------------------------------

export interface ProdutoVendido {
  id: string | null;
  nome: string;
  quantidade: number;
  receita: number;
  custo: number;
  lucro: number;
  margem: number;
}

interface ItemLinha {
  produto_id: string | null;
  produto_nome: string;
  quantidade: number;
  preco_unitario: number;
  custo_unitario: number;
  venda_id: string;
  vendas: { desconto: number } | null;
}

export async function produtosVendidos(supabase: SupabaseClient, inicio: string, fimExclusivo: string): Promise<ProdutoVendido[]> {
  const itens = await paginar<ItemLinha>(
    (de, ate) =>
      supabase
        .from("venda_itens")
        .select("produto_id, produto_nome, quantidade, preco_unitario, custo_unitario, venda_id, vendas!inner(desconto, data, status)")
        .eq("vendas.status", "concluida")
        .gte("vendas.data", inicio)
        .lt("vendas.data", fimExclusivo)
        .order("id")
        .range(de, ate) as unknown as PromiseLike<{ data: ItemLinha[] | null; error: { message: string } | null }>,
  );

  // o desconto da venda é repartido entre os itens na proporção do valor de cada um
  const brutoDaVenda = new Map<string, number>();
  for (const i of itens) brutoDaVenda.set(i.venda_id, (brutoDaVenda.get(i.venda_id) ?? 0) + i.quantidade * Number(i.preco_unitario));

  const produtos = new Map<string, { id: string | null; nome: string; quantidade: number; receita: number; custo: number }>();
  for (const i of itens) {
    const bruto = i.quantidade * Number(i.preco_unitario);
    const total = brutoDaVenda.get(i.venda_id) ?? 0;
    const desconto = total > 0 ? (Number(i.vendas?.desconto ?? 0) * bruto) / total : 0;
    const chave = i.produto_id ?? `nome:${i.produto_nome}`;
    const p = produtos.get(chave) ?? { id: i.produto_id, nome: i.produto_nome, quantidade: 0, receita: 0, custo: 0 };
    p.quantidade += i.quantidade;
    p.receita += bruto - desconto;
    p.custo += i.quantidade * Number(i.custo_unitario);
    produtos.set(chave, p);
  }
  return Array.from(produtos.values()).map((p) => ({ ...p, lucro: p.receita - p.custo, margem: margem(p.receita - p.custo, p.receita) }));
}

export type OrdemProdutos = "vendidos" | "lucro" | "margem";

export function ordenarProdutos(lista: ProdutoVendido[], ordem: OrdemProdutos) {
  return [...lista].sort((a, b) => (ordem === "vendidos" ? b.quantidade - a.quantidade : ordem === "lucro" ? b.lucro - a.lucro : b.margem - a.margem));
}

// ---------------------------------------------------------------------------
// canais e formas de pagamento
// ---------------------------------------------------------------------------

export interface GrupoDeVendas {
  nome: string;
  vendas: number;
  receita: number;
  lucro: number;
  margem: number;
}

export function agruparVendas(
  vendas: { canal: string | null; forma_pagamento: string | null; valor_total: number; custo_total: number }[],
  campo: "canal" | "forma_pagamento",
  semNome: string,
): GrupoDeVendas[] {
  const mapa = new Map<string, { vendas: number; receita: number; custo: number }>();
  for (const v of vendas) {
    const nome = v[campo]?.trim() || semNome;
    const g = mapa.get(nome) ?? { vendas: 0, receita: 0, custo: 0 };
    g.vendas += 1;
    g.receita += v.valor_total;
    g.custo += v.custo_total;
    mapa.set(nome, g);
  }
  return Array.from(mapa, ([nome, g]) => ({ nome, vendas: g.vendas, receita: g.receita, lucro: g.receita - g.custo, margem: margem(g.receita - g.custo, g.receita) })).sort(
    (a, b) => b.receita - a.receita,
  );
}

// ---------------------------------------------------------------------------
// caixa
// ---------------------------------------------------------------------------

export interface CaixaPeriodo {
  entradas: number;
  saidas: number;
  gastos: { categoria: string; valor: number }[];
}

interface Lancamento {
  tipo: "entrada" | "saida";
  categoria: string;
  valor: number;
}

export async function caixaDoPeriodo(supabase: SupabaseClient, inicio: string, fimExclusivo: string): Promise<CaixaPeriodo> {
  const lancamentos = await paginar<Lancamento>((de, ate) =>
    supabase.from("lancamentos_caixa").select("tipo, categoria, valor").gte("data", inicio).lt("data", fimExclusivo).order("id").range(de, ate),
  );
  let entradas = 0;
  let saidas = 0;
  const porCategoria = new Map<string, number>();
  for (const l of lancamentos) {
    const valor = Number(l.valor);
    if (l.tipo === "entrada") {
      entradas += valor;
    } else {
      saidas += valor;
      porCategoria.set(l.categoria, (porCategoria.get(l.categoria) ?? 0) + valor);
    }
  }
  const gastos = Array.from(porCategoria, ([categoria, valor]) => ({ categoria, valor })).sort((a, b) => b.valor - a.valor);
  return { entradas, saidas, gastos };
}

// ---------------------------------------------------------------------------
// dinheiro parado: produtos com estoque que não vendem há 30, 60 ou 90 dias (a custo)
// ---------------------------------------------------------------------------

export interface ProdutoParado {
  id: string;
  nome: string;
  estoque: number;
  valor: number; // custo do estoque parado
  dias: number;
}

export interface FaixaParada {
  de: 30 | 60 | 90;
  rotulo: string;
  valor: number;
  produtos: number;
}

export interface DinheiroParado {
  total: number;
  faixas: FaixaParada[];
  maiores: ProdutoParado[];
}

interface ProdutoEstoque {
  id: string;
  nome: string;
  status: string;
  estoque_total: number;
  valor_estoque: number;
  created_at: string;
}

export async function dinheiroParado(supabase: SupabaseClient, hoje: string = hojeISO()): Promise<DinheiroParado> {
  const desde = somarDias(hoje, -90);
  const [produtos, itens] = await Promise.all([
    paginar<ProdutoEstoque>((de, ate) =>
      supabase.from("produtos_com_estoque").select("id, nome, status, estoque_total, valor_estoque, created_at").gt("estoque_total", 0).neq("status", "inativo").order("id").range(de, ate),
    ),
    paginar<{ produto_id: string | null; vendas: { data: string } | null }>(
      (de, ate) =>
        supabase
          .from("venda_itens")
          .select("produto_id, vendas!inner(data, status)")
          .eq("vendas.status", "concluida")
          .gte("vendas.data", desde)
          .order("id")
          .range(de, ate) as unknown as PromiseLike<{ data: { produto_id: string | null; vendas: { data: string } | null }[] | null; error: { message: string } | null }>,
    ),
  ]);

  const ultimaVenda = new Map<string, string>();
  for (const i of itens) {
    const d = i.vendas?.data;
    if (!i.produto_id || !d) continue;
    if (d > (ultimaVenda.get(i.produto_id) ?? "")) ultimaVenda.set(i.produto_id, d);
  }

  const parados: ProdutoParado[] = [];
  for (const p of produtos) {
    // sem venda nos últimos 90 dias: conta a partir do cadastro; o produto novo ainda não "parou"
    const referencia = ultimaVenda.get(p.id) ?? p.created_at.slice(0, 10);
    const dias = diasEntre(referencia, hoje) - 1;
    if (dias < 30) continue;
    parados.push({ id: p.id, nome: p.nome, estoque: p.estoque_total, valor: Number(p.valor_estoque), dias });
  }

  const faixas: FaixaParada[] = [
    { de: 30, rotulo: "30 a 59 dias", valor: 0, produtos: 0 },
    { de: 60, rotulo: "60 a 89 dias", valor: 0, produtos: 0 },
    { de: 90, rotulo: "90 dias ou mais", valor: 0, produtos: 0 },
  ];
  for (const p of parados) {
    const f = faixas[p.dias >= 90 ? 2 : p.dias >= 60 ? 1 : 0];
    f.valor += p.valor;
    f.produtos += 1;
  }
  return {
    total: faixas.reduce((s, f) => s + f.valor, 0),
    faixas,
    maiores: parados.sort((a, b) => b.valor - a.valor).slice(0, 5),
  };
}

// ---------------------------------------------------------------------------
// capas dos produtos (primeira foto geral; foto de variação só se não houver outra)
// ---------------------------------------------------------------------------

export async function capasDeProdutos(supabase: SupabaseClient, ids: string[]): Promise<Map<string, string>> {
  const unicos = [...new Set(ids)];
  const capas = new Map<string, string>();
  if (unicos.length === 0) return capas;
  const fotos = await paginar<{ produto_id: string; path: string; variacao_id: string | null }>((de, ate) =>
    supabase.from("produto_fotos").select("produto_id, path, variacao_id").in("produto_id", unicos).order("ordem").order("created_at").order("id").range(de, ate),
  );
  const geral = new Map<string, string>();
  const qualquer = new Map<string, string>();
  for (const f of fotos) {
    if (f.variacao_id === null && !geral.has(f.produto_id)) geral.set(f.produto_id, f.path);
    if (!qualquer.has(f.produto_id)) qualquer.set(f.produto_id, f.path);
  }
  const caminhoDe = new Map([...qualquer, ...geral]);
  const caminhos = [...new Set(caminhoDe.values())];
  if (caminhos.length === 0) return capas;
  const { data: assinadas } = await supabase.storage.from("produto-fotos").createSignedUrls(caminhos, 3600);
  const url = new Map((assinadas ?? []).map((a) => [a.path, a.signedUrl]));
  for (const [id, caminho] of caminhoDe) {
    const u = url.get(caminho);
    if (u) capas.set(id, u);
  }
  return capas;
}

// ---------------------------------------------------------------------------
// clientes: novos x recorrentes, quem mais compra e quem sumiu
// ---------------------------------------------------------------------------

export interface ClienteResumo {
  id: string;
  nome: string;
  telefone: string | null;
  total: number;
  compras: number;
  ultima: string;
}

export interface AnaliseClientes {
  compradores: number; // clientes com alguma compra (todo o histórico)
  noPeriodo: {
    novos: number;
    recorrentes: number;
    receitaNovos: number;
    receitaRecorrentes: number;
    melhores: ClienteResumo[]; // quem mais comprou no período
  };
  melhoresDeSempre: ClienteResumo[];
  sumidos: ClienteResumo[]; // sem compra há `diasSumido` dias ou mais, quem mais comprou primeiro
  diasSumido: number;
}

export const DIAS_SUMIDO = 60;

export async function analiseClientes(supabase: SupabaseClient, periodo: Intervalo, hoje: string = hojeISO()): Promise<AnaliseClientes> {
  const [vendas, clientes] = await Promise.all([
    paginar<{ cliente_id: string; data: string; valor_total: number }>((de, ate) =>
      supabase
        .from("vendas")
        .select("cliente_id, data, valor_total")
        .eq("status", "concluida")
        .not("cliente_id", "is", null)
        .order("id")
        .range(de, ate),
    ),
    paginar<{ id: string; nome: string; telefone: string | null }>((de, ate) => supabase.from("clientes").select("id, nome, telefone").order("id").range(de, ate)),
  ]);
  const porId = new Map(clientes.map((c) => [c.id, c]));

  const tudo = new Map<string, ClienteResumo & { primeira: string }>();
  const doPeriodo = new Map<string, { total: number; compras: number; ultima: string }>();
  for (const v of vendas) {
    const c = porId.get(v.cliente_id);
    if (!c) continue;
    const valor = Number(v.valor_total);
    const r = tudo.get(c.id) ?? { ...c, total: 0, compras: 0, ultima: v.data, primeira: v.data };
    r.total += valor;
    r.compras += 1;
    if (v.data > r.ultima) r.ultima = v.data;
    if (v.data < r.primeira) r.primeira = v.data;
    tudo.set(c.id, r);
    if (v.data >= periodo.inicio && v.data < periodo.fimExclusivo) {
      const p = doPeriodo.get(c.id) ?? { total: 0, compras: 0, ultima: v.data };
      p.total += valor;
      p.compras += 1;
      if (v.data > p.ultima) p.ultima = v.data;
      doPeriodo.set(c.id, p);
    }
  }

  let novos = 0;
  let recorrentes = 0;
  let receitaNovos = 0;
  let receitaRecorrentes = 0;
  const melhoresPeriodo: ClienteResumo[] = [];
  for (const [id, p] of doPeriodo) {
    const c = tudo.get(id)!;
    // novo: a primeira compra de todas aconteceu dentro do período
    if (c.primeira >= periodo.inicio) {
      novos += 1;
      receitaNovos += p.total;
    } else {
      recorrentes += 1;
      receitaRecorrentes += p.total;
    }
    melhoresPeriodo.push({ id, nome: c.nome, telefone: c.telefone, total: p.total, compras: p.compras, ultima: p.ultima });
  }

  const todos = Array.from(tudo.values());
  const limite = somarDias(hoje, -DIAS_SUMIDO);
  return {
    compradores: todos.length,
    noPeriodo: { novos, recorrentes, receitaNovos, receitaRecorrentes, melhores: melhoresPeriodo.sort((a, b) => b.total - a.total).slice(0, 5) },
    melhoresDeSempre: [...todos].sort((a, b) => b.total - a.total).slice(0, 10),
    sumidos: todos.filter((c) => c.ultima < limite).sort((a, b) => b.total - a.total),
    diasSumido: DIAS_SUMIDO,
  };
}

// ---------------------------------------------------------------------------
// o relatório inteiro de um período
// ---------------------------------------------------------------------------

export async function carregarRelatorio(supabase: SupabaseClient, periodo: PeriodoRelatorio) {
  const hoje = hojeISO();
  const [vendas, vendasAnteriores, produtos, caixa, caixaAnterior, parado, clientes] = await Promise.all([
    vendasConcluidas(supabase, periodo.inicio, periodo.fimExclusivo),
    vendasConcluidas(supabase, periodo.anterior.inicio, periodo.anterior.fimExclusivo),
    produtosVendidos(supabase, periodo.inicio, periodo.fimExclusivo),
    caixaDoPeriodo(supabase, periodo.inicio, periodo.fimExclusivo),
    caixaDoPeriodo(supabase, periodo.anterior.inicio, periodo.anterior.fimExclusivo),
    dinheiroParado(supabase, hoje),
    analiseClientes(supabase, periodo, hoje),
  ]);

  const maisVendidos = ordenarProdutos(produtos, "vendidos").slice(0, 5);
  const maisLucrativos = ordenarProdutos(produtos, "lucro").slice(0, 5);
  // margem baixa: vendeu e rendeu pouco (menos de 15%) ou deu prejuízo; os piores primeiro
  const margemBaixa = produtos
    .filter((p) => p.receita > 0 && p.margem < 15)
    .sort((a, b) => a.margem - b.margem)
    .slice(0, 5);

  const idsComFoto = [...maisVendidos, ...maisLucrativos, ...margemBaixa].map((p) => p.id).filter((id): id is string => !!id);
  for (const p of parado.maiores) idsComFoto.push(p.id);
  const capas = await capasDeProdutos(supabase, idsComFoto);

  return {
    vendas,
    totais: totaisDeVendas(vendas),
    totaisAnteriores: totaisDeVendas(vendasAnteriores),
    serie: serieEvolucao(vendas, periodo.de, periodo.ate),
    produtos,
    maisVendidos,
    maisLucrativos,
    margemBaixa,
    canais: agruparVendas(vendas, "canal", "Sem canal"),
    pagamentos: agruparVendas(vendas, "forma_pagamento", "Não informada"),
    caixa,
    caixaAnterior,
    parado,
    clientes,
    capas,
  };
}
