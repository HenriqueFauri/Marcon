import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatData, hojeISO, somarDias } from "@/lib/format";
import { enviarNotificacao } from "./send";

// Rotina diária das cortesias (roda junto da rotina das 8h, ver vercel.json: o plano Hobby da Vercel
// aceita só 2 rotinas agendadas, então não ganha uma própria).
//   - 3 dias antes do fim: avisa o cliente, para ele assinar se quiser continuar;
//   - passou do prazo: encerra a cortesia (a regra de limites do banco já tratava como vencida) e avisa.
// Um cliente com problema no aviso não impede os demais.
export async function rotinaDeCortesias(admin: SupabaseClient) {
  const hoje = hojeISO();
  const { data, error } = await admin
    .from("assinaturas")
    .select("owner_id, cortesia_ate")
    .eq("status", "cortesia")
    .not("cortesia_ate", "is", null);
  if (error) throw error;

  let avisadas = 0;
  let encerradas = 0;
  for (const c of data ?? []) {
    const ate = c.cortesia_ate as string;
    try {
      if (ate < hoje) {
        // só encerra se ainda for cortesia: uma assinatura paga no meio do caminho não é tocada
        const { data: feito } = await admin
          .from("assinaturas")
          .update({ status: "cancelada", updated_at: new Date().toISOString() })
          .eq("owner_id", c.owner_id)
          .eq("status", "cortesia")
          .select("owner_id");
        if (feito?.length) {
          encerradas++;
          await enviarNotificacao(
            c.owner_id,
            "Sua cortesia terminou",
            "Seus dados continuam guardados. Para seguir com o plano Marcon, é só assinar.",
            "/assinatura",
            admin,
          );
        }
      } else if (ate === somarDias(hoje, 2)) {
        // falta hoje, amanhã e depois: 3 dias contando hoje
        avisadas++;
        await enviarNotificacao(
          c.owner_id,
          "Sua cortesia termina em 3 dias",
          `O plano Marcon liberado vale até ${formatData(ate)}. Para continuar, é só assinar.`,
          "/assinatura",
          admin,
        );
      }
    } catch (e) {
      console.error("[cortesia] rotina", { ownerId: c.owner_id, erro: e instanceof Error ? e.message : String(e) });
    }
  }
  return { cortesias: data?.length ?? 0, avisadas, encerradas };
}
