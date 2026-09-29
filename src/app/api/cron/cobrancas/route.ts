import { createAdminClient } from "@/lib/supabase/admin";
import { enviarCobrancasDoDia } from "@/lib/push/eventos";

// Chamada diária por um agendador (ver vercel.json). O agendador envia
// "Authorization: Bearer <CRON_SECRET>"; sem o segredo configurado a rota fica fechada.
export async function GET(request: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || request.headers.get("authorization") !== `Bearer ${segredo}`) {
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
