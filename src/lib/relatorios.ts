import type { SupabaseClient } from "@supabase/supabase-js";

// Leituras para relatórios. O PostgREST corta cada resposta em 1000 linhas, então tudo aqui
// vem em páginas até acabar. A segurança é a RLS por owner_id das próprias tabelas.

const PAGINA = 1000;

export async function paginar<T>(
  buscar: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const todas: T[] = [];
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await buscar(de, de + PAGINA - 1);
    if (error) throw new Error(error.message);
    todas.push(...(data ?? []));
    if (!data || data.length < PAGINA) break;
  }
  return todas;
}

export interface VendaResumo {
  id: string;
  data: string;
  canal: string | null;
  cliente_id: string | null;
  valor_total: number;
  custo_total: number;
}

export async function vendasConcluidas(supabase: SupabaseClient, inicio: string, fimExclusivo: string | null) {
  const linhas = await paginar<VendaResumo>((de, ate) => {
    let q = supabase
      .from("vendas")
      .select("id, data, canal, cliente_id, valor_total, custo_total")
      .eq("status", "concluida")
      .gte("data", inicio)
      .order("data")
      .order("id")
      .range(de, ate);
    if (fimExclusivo) q = q.lt("data", fimExclusivo);
    return q;
  });
  return linhas.map((v) => ({ ...v, valor_total: Number(v.valor_total), custo_total: Number(v.custo_total) }));
}

export interface TotaisVendas {
  vendas: number;
  receita: number;
  lucro: number;
}

export function totaisDeVendas(vendas: { valor_total: number; custo_total: number }[]): TotaisVendas {
  let receita = 0;
  let custo = 0;
  for (const v of vendas) {
    receita += v.valor_total;
    custo += v.custo_total;
  }
  return { vendas: vendas.length, receita, lucro: receita - custo };
}

export function margem(lucro: number, receita: number) {
  return receita > 0 ? (lucro / receita) * 100 : 0;
}

export function formatPct(valor: number) {
  return `${valor.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

// variação em relação ao período anterior: null quando não há base de comparação
export function variacao(atual: number, anterior: number) {
  if (anterior === 0) return null;
  return ((atual - anterior) / Math.abs(anterior)) * 100;
}
