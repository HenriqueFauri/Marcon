import type { User } from "@supabase/supabase-js";

// Admins do Marcon: e-mails em ADMIN_EMAILS, separados por vírgula. Fica no
// servidor, e não nos metadados do usuário, porque esses o próprio usuário edita.
// A conta do admin continua sendo uma conta normal, com o próprio negócio.
function emailsAdmin() {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function ehAdmin(user: Pick<User, "email" | "email_confirmed_at"> | null | undefined) {
  const email = user?.email?.toLowerCase();
  // e-mail não confirmado não prova que a conta é de quem diz ser
  return !!email && !!user?.email_confirmed_at && emailsAdmin().includes(email);
}
