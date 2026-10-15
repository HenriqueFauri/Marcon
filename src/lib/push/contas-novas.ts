import "server-only";
import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { enviarNotificacao } from "./send";

const DIA_MS = 24 * 60 * 60 * 1000;

// Avisa os admins (tabela admins) quando uma conta nova abre o app pela primeira vez. Vale para
// qualquer jeito de entrar (e-mail e senha, Google), porque roda no app e não no cadastro.
// A tabela contas_avisadas garante um aviso só por conta. Nunca lança: o aviso não pode atrapalhar
// quem está entrando.
export async function avisarContaNova(user: User) {
  try {
    // conta antiga: já foi avisada na migration ou nunca será; poupa a consulta em toda página
    if (Date.now() - new Date(user.created_at).getTime() > 2 * DIA_MS) return;

    const db = createAdminClient();
    if (!db) return;

    const { data: nova, error } = await db
      .from("contas_avisadas")
      .upsert({ owner_id: user.id }, { onConflict: "owner_id", ignoreDuplicates: true })
      .select("owner_id");
    if (error) throw error;
    if (!nova?.length) return; // já avisada

    const { data: admins, error: erroAdmins } = await db.from("admins").select("user_id");
    if (erroAdmins) throw erroAdmins;

    const nome =
      (user.user_metadata?.nome_negocio as string | undefined) ||
      (user.user_metadata?.nome as string | undefined) ||
      (user.user_metadata?.full_name as string | undefined) ||
      "Conta nova";
    const como = user.app_metadata?.provider === "google" ? "Google" : "e-mail e senha";

    for (const a of admins ?? []) {
      if (a.user_id === user.id) continue; // o admin não precisa ser avisado da própria conta
      await enviarNotificacao(a.user_id, "Nova conta no Marcon", `${nome}, ${user.email ?? "sem e-mail"} (${como})`, `/admin/contas/${user.id}`, db);
    }
  } catch (e) {
    console.error("[conta nova] aviso ao admin", e instanceof Error ? e.message : String(e));
  }
}
