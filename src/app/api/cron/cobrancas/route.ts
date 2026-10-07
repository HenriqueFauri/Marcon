import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { enviarCobrancasDoDia } from "@/lib/push/eventos";

// comparação em tempo constante, como no webhook do Asaas
function segredoConfere(recebido: string | null, esperado: string) {
  if (!recebido) return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(`Bearer ${esperado}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Chamada diária por um agendador (ver vercel.json). O agendador envia
// "Authorization: Bearer <CRON_SECRET>"; sem o segredo configurado a rota fica fechada.
export async function GET(request: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || !segredoConfere(request.headers.get("authorization"), segredo)) {
    return new Response("Não autorizado", { status: 401 });
  }

  const admin = createAdminClient();
  if (!admin) return new Response("SUPABASE_SERVICE_ROLE_KEY não configurada", { status: 500 });

  try {
    return Response.json(await enviarCobrancasDoDia(admin));
  } catch (e) {
    console.error("Falha nos lembretes de cobrança", e);
    return new Response("Erro ao enviar lembretes", { status: 500 });
  }
}
