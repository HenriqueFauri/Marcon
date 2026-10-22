import type { SupabaseClient } from "@supabase/supabase-js";
import { deslocarMes, intervaloDoMes } from "@/lib/format";
import { paginar, totaisDeVendas, vendasConcluidas, type TotaisVendas } from "@/lib/relatorios";

// Fechamento do mês: vendas, lucro, caixa e gastos por categoria, com o mês anterior ao lado.

export interface ResumoMes {
  mes: string;
  vendas: TotaisVendas;
  entradas: number;
  saidas: number;
  gastos: { categoria: string; valor: number }[];
}

interface Lancamento {
  tipo: "entrada" | "saida";
  categoria: string;
  valor: number;
}

async function resumoDoMes(supabase: SupabaseClient, mes: string): Promise<ResumoMes> {
  const { inicio, fimExclusivo } = intervaloDoMes(mes);
  const [vendas, lancamentos] = await Promise.all([
    vendasConcluidas(supabase, inicio, fimExclusivo),
    paginar<Lancamento>((de, ate) =>
      supabase
        .from("lancamentos_caixa")
        .select("tipo, categoria, valor")
        .gte("data", inicio)
        .lt("data", fimExclusivo)
        .order("id")
        .range(de, ate),
    ),
  ]);
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
  return { mes, vendas: totaisDeVendas(vendas), entradas, saidas, gastos };
}

export async function fechamentoDoMes(supabase: SupabaseClient, mes: string) {
  const [atual, anterior] = await Promise.all([resumoDoMes(supabase, mes), resumoDoMes(supabase, deslocarMes(mes, -1))]);
  return { atual, anterior };
}
