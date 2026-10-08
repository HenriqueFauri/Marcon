import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { hojeISO } from "@/lib/format";

// Cota do assistente (decisão de 2026-10-08): 600 perguntas por mês e no máximo 40 por dia.
// Só pergunta que usa IA conta: ajuda, limpar, SIM e NÃO não contam. O mês não acumula.
// O uso fica no contador do banco (limites_taxa, migration 0034): uma linha por conta por dia
// na chave wa:uso:<conta>, e o mês é a soma dessas linhas.

type Db = NonNullable<ReturnType<typeof createAdminClient>>;

export const COTA_MES = Number(process.env.WHATSAPP_COTA_MES ?? 600);
export const TETO_DIA = Number(process.env.WHATSAPP_LIMITE_DIA ?? 40);
export const AVISO_EM = 0.8; // avisa uma vez ao passar de 80% da cota

const chave = (owner: string) => `wa:uso:${owner}`;

// as janelas do contador são dias em UTC; o mês começa no dia 1º (diferença de 3 horas na virada, aceitável)
function inicioDoMes() {
  return `${hojeISO().slice(0, 7)}-01T00:00:00Z`;
}

export async function usoDoMes(db: Db, owner: string): Promise<number> {
  const { data, error } = await db.from("limites_taxa").select("n").eq("chave", chave(owner)).gte("janela", inicioDoMes());
  if (error) throw error;
  return (data ?? []).reduce((s, l) => s + Number(l.n), 0);
}

export async function registrarUso(db: Db, owner: string) {
  const { error } = await db.rpc("consumir_limite", { p_chave: chave(owner), p_max: 1_000_000, p_segundos: 86400 });
  if (error) console.error("[whatsapp] registrar uso", error.message);
}
