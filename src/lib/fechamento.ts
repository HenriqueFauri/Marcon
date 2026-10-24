import type { SupabaseClient } from "@supabase/supabase-js";
import { deslocarMes, intervaloDoMes, somarDias } from "@/lib/format";
import { serieEvolucao, totaisDeVendas, vendasConcluidas, type PontoEvolucao, type TotaisVendas } from "@/lib/relatorios";
import {
  aPagarNoPeriodo,
  aReceberNoPeriodo,
  caixaDoPeriodo,
  ordenarProdutos,
  produtosVendidos,
  valorEmEstoque,
  type CaixaPeriodo,
  type ProdutoVendido,
} from "@/lib/relatorios-dados";

// Fechamento do mês: quanto sobrou de verdade, vendas, caixa, despesas e compras de estoque,
// produtos, o que vem no mês seguinte, com o mês anterior ao lado.
//
// Sobrou = Lucro das vendas − Despesas
//   Lucro das vendas = Σ vendas.valor_total − Σ vendas.custo_total (status concluida, data no mês).
//     custo_total já soma o custo dos produtos e os outros gastos da venda (motoboy, embalagem).
//   Despesas = Σ lancamentos_caixa.valor das saídas do mês que não são compra de estoque, nem
//     ligadas a uma venda, nem retirada do dono (ver tipoDeSaida em relatorios-dados).

export interface ResumoMes extends CaixaPeriodo {
  mes: string;
  vendas: TotaisVendas;
  custoMercadorias: number; // custo dos produtos vendidos
  gastosDasVendas: number; // outros gastos das vendas (já descontados do lucro)
  sobrou: number;
  dias: PontoEvolucao[]; // faturamento e lucro de cada dia do mês
  maisLucrativos: ProdutoVendido[]; // só no mês fechado (o anterior vem vazio)
}

async function resumoDoMes(supabase: SupabaseClient, mes: string, comProdutos: boolean): Promise<ResumoMes> {
  const { inicio, fimExclusivo } = intervaloDoMes(mes);
  const [vendas, caixa, produtos] = await Promise.all([
    vendasConcluidas(supabase, inicio, fimExclusivo),
    caixaDoPeriodo(supabase, inicio, fimExclusivo),
    comProdutos ? produtosVendidos(supabase, inicio, fimExclusivo) : Promise.resolve([] as ProdutoVendido[]),
  ]);
  const totais = totaisDeVendas(vendas);
  const gastosDasVendas = vendas.reduce((s, v) => s + v.outros_gastos, 0);
  const custoTotal = totais.receita - totais.lucro;
  return {
    mes,
    vendas: totais,
    custoMercadorias: custoTotal - gastosDasVendas,
    gastosDasVendas,
    ...caixa,
    sobrou: totais.lucro - caixa.despesas,
    dias: serieEvolucao(vendas, inicio, somarDias(fimExclusivo, -1)).pontos,
    maisLucrativos: ordenarProdutos(produtos, "lucro").slice(0, 5),
  };
}

export interface ProximoMes {
  mes: string;
  aPagar: { total: number; quantidade: number }; // contas_a_pagar abertas que vencem no mês seguinte
  aReceber: { total: number; quantidade: number }; // parcelas não pagas que vencem no mês seguinte
  estoqueHoje: number; // valor do estoque a custo, hoje
}

export async function fechamentoDoMes(supabase: SupabaseClient, mes: string) {
  const proximo = deslocarMes(mes, 1);
  const p = intervaloDoMes(proximo);
  const [atual, anterior, aPagar, aReceber, estoqueHoje] = await Promise.all([
    resumoDoMes(supabase, mes, true),
    resumoDoMes(supabase, deslocarMes(mes, -1), false),
    aPagarNoPeriodo(supabase, p.inicio, p.fimExclusivo),
    aReceberNoPeriodo(supabase, p.inicio, p.fimExclusivo),
    valorEmEstoque(supabase),
  ]);
  const seguinte: ProximoMes = { mes: proximo, aPagar, aReceber, estoqueHoje };
  return { atual, anterior, seguinte };
}
