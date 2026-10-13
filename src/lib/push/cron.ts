import "server-only";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

// comparação em tempo constante, como no webhook do Asaas
function segredoConfere(recebido: string | null, esperado: string) {
  if (!recebido) return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(`Bearer ${esperado}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

// Molde das rotinas diárias (ver vercel.json). O agendador envia "Authorization: Bearer <CRON_SECRET>";
// sem o segredo configurado a rota fica fechada.
export async function rodarRotina(request: Request, nome: string, rotina: (admin: Admin) => Promise<unknown>) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || !segredoConfere(request.headers.get("authorization"), segredo)) {
    return new Response("Não autorizado", { status: 401 });
  }

  const admin = createAdminClient();
  if (!admin) return new Response("SUPABASE_SERVICE_ROLE_KEY não configurada", { status: 500 });

  try {
    return Response.json(await rotina(admin));
  } catch (e) {
    console.error(`[cron] falha em ${nome}`, e);
    return new Response(`Erro em ${nome}`, { status: 500 });
  }
}
