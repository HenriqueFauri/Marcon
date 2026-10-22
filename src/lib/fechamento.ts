import type { SupabaseClient } from "@supabase/supabase-js";
import { deslocarMes, intervaloDoMes, somarDias } from "@/lib/format";
import { serieEvolucao, totaisDeVendas, vendasConcluidas, type PontoEvolucao, type TotaisVendas } from "@/lib/relatorios";
import { caixaDoPeriodo, ordenarProdutos, produtosVendidos, type ProdutoVendido } from "@/lib/relatorios-dados";

// Fechamento do mês: vendas, lucro, caixa, gastos por categoria e produtos, com o mês anterior ao lado.

export interface ResumoMes {
  mes: string;
  vendas: TotaisVendas;
  entradas: number;
  saidas: number;
  gastos: { categoria: string; valor: number }[];
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
  return {
    mes,
    vendas: totaisDeVendas(vendas),
    ...caixa,
    dias: serieEvolucao(vendas, inicio, somarDias(fimExclusivo, -1)).pontos,
    maisLucrativos: ordenarProdutos(produtos, "lucro").slice(0, 5),
  };
}

export async function fechamentoDoMes(supabase: SupabaseClient, mes: string) {
  const [atual, anterior] = await Promise.all([resumoDoMes(supabase, mes, true), resumoDoMes(supabase, deslocarMes(mes, -1), false)]);
  return { atual, anterior };
}
