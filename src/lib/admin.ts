import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

// Admins do Marcon. São DOIS fatores, e os dois precisam bater:
//   1. o e-mail em ADMIN_EMAILS (variável na Vercel), confirmado;
//   2. o id da conta na tabela admins do banco (migration 0048), que só a chave de serviço lê.
// Quem tiver acesso a só um dos dois (a Vercel ou o banco) não vira admin. O e-mail fica no
// servidor, e não nos metadados do usuário, porque esses o próprio usuário edita.
// A conta do admin continua sendo uma conta normal, com o próprio negócio.
function emailsAdmin() {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

// Só o primeiro fator. Serve para marcar contas de admin numa lista (e impedir bloqueá-las),
// nunca para liberar acesso: para isso use adminConfirmado().
export function ehAdmin(user: Pick<User, "email" | "email_confirmed_at"> | null | undefined) {
  const email = user?.email?.toLowerCase();
  // e-mail não confirmado não prova que a conta é de quem diz ser
  return !!email && !!user?.email_confirmed_at && emailsAdmin().includes(email);
}

// Os dois fatores. Toda tela e ação de admin passa por aqui.
export async function adminConfirmado(user: User | null | undefined): Promise<boolean> {
  if (!user || !ehAdmin(user)) return false;
  const db = createAdminClient();
  if (!db) return false;
  const { data, error } = await db.rpc("eh_admin", { p_user: user.id });
  if (error) {
    console.error("[admin] segundo fator", error.message);
    return false; // na dúvida, não é admin
  }
  return data === true;
}

// O que o admin olhou ou fez em outra conta (tabela admin_registro). Não trava a tela se falhar.
export async function registrarAdmin(adminId: string, acao: string, alvoId?: string | null, detalhe?: Record<string, unknown>) {
  const db = createAdminClient();
  if (!db) return;
  const { error } = await db.from("admin_registro").insert({ admin_id: adminId, acao, alvo_id: alvoId ?? null, detalhe: detalhe ?? null });
  if (error) console.error("[admin] registro", error.message);
}
