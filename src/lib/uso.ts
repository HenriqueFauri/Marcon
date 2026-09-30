import type { SupabaseClient } from "@supabase/supabase-js";

// Uso do plano do usuário, lido do banco (função uso_do_plano, migration 0013).
// O banco é quem impõe os limites; aqui só se lê o uso para explicar e antecipar.

export type PlanoAtual = "teste" | "gratis" | "pago";

export interface Uso {
  plano: PlanoAtual;
  vendasMes: number;
  produtos: number;
  limites: {
    vendasMes: number | null; // null = sem limite
    produtos: number | null;
    fotosPorItem: number;
    importaHistorico: boolean;
  };
}

// devolve null se a função ainda não existe no banco (migration 0013 pendente):
// as telas seguem funcionando, só sem os avisos de limite
export async function lerUso(supabase: SupabaseClient): Promise<Uso | null> {
  const { data, error } = await supabase.rpc("uso_do_plano");
  if (error || !data) return null;
  const d = data as {
    plano: PlanoAtual;
    vendas_mes: number;
    produtos: number;
    limites: { vendas_mes: number | null; produtos: number | null; fotos_por_item: number; importa_historico: boolean };
  };
  return {
    plano: d.plano,
    vendasMes: d.vendas_mes,
    produtos: d.produtos,
    limites: {
      vendasMes: d.limites.vendas_mes,
      produtos: d.limites.produtos,
      fotosPorItem: d.limites.fotos_por_item,
      importaHistorico: d.limites.importa_historico,
    },
  };
}

// quantos ainda cabem; null quando não há limite
export function restante(usado: number, limite: number | null) {
  return limite === null ? null : Math.max(limite - usado, 0);
}

// avisa quando faltam poucos, para o limite não pegar ninguém de surpresa
export const AVISAR_QUANDO_FALTAREM = 5;
