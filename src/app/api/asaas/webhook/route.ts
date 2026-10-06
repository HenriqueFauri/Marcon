import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { registrarComissao } from "@/lib/indicacao-servidor";

// Webhook do Asaas: mantém a tabela assinaturas igual ao que o Asaas diz.
// Cadastre no painel do Asaas (Integrações > Webhooks) com o mesmo token de
// ASAAS_WEBHOOK_TOKEN e os eventos de cobrança e de assinatura.

interface EventoAsaas {
  id?: string;
  event?: string;
  payment?: { id?: string; value?: number; subscription?: string; dueDate?: string };
  subscription?: { id?: string };
}

function tokenValido(recebido: string | null) {
  const esperado = process.env.ASAAS_WEBHOOK_TOKEN;
  if (!esperado || !recebido) return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

// vencimento pago + 1 mês = próxima cobrança
function mesSeguinte(data: string | undefined) {
  if (!data) return null;
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 10);
}

export async function POST(request: Request) {
  if (!tokenValido(request.headers.get("asaas-access-token"))) {
    return new Response("Não autorizado", { status: 401 });
  }

  const admin = createAdminClient();
  if (!admin) return new Response("SUPABASE_SERVICE_ROLE_KEY não configurada", { status: 500 });

  let evento: EventoAsaas;
  try {
    evento = (await request.json()) as EventoAsaas;
  } catch {
    return new Response("Corpo inválido", { status: 400 });
  }

  const tipo = evento.event ?? "";
  const assinaturaId = evento.payment?.subscription ?? evento.subscription?.id;

  try {
    if (evento.id) {
      const { data: jaVisto } = await admin.from("asaas_eventos").select("id").eq("id", evento.id).maybeSingle();
      if (jaVisto) return Response.json({ ok: true, repetido: true });
    }

    // cobrança avulsa ou evento que não muda assinatura: só confirma o recebimento
    if (assinaturaId) {
      const { data: linha } = await admin
        .from("assinaturas")
        .select("owner_id, status")
        .eq("asaas_subscription_id", assinaturaId)
        .maybeSingle();

      // comissão de quem indicou esta conta (ou estorno dela)
      if (linha) await registrarComissao(admin, linha.owner_id, tipo, evento.payment);

      // assinatura cancelada não volta por um evento atrasado
      if (linha && linha.status !== "cancelada") {
        let mudanca: { status: string; proximo_vencimento?: string | null } | null = null;
        if (tipo === "PAYMENT_CONFIRMED" || tipo === "PAYMENT_RECEIVED") {
          mudanca = { status: "ativa", proximo_vencimento: mesSeguinte(evento.payment?.dueDate) };
        } else if (tipo === "PAYMENT_OVERDUE") {
          mudanca = { status: "atrasada" };
        } else if (tipo === "SUBSCRIPTION_DELETED" || tipo === "SUBSCRIPTION_INACTIVATED") {
          mudanca = { status: "cancelada" };
        }

        if (mudanca) {
          const { error } = await admin
            .from("assinaturas")
            .update({ ...mudanca, updated_at: new Date().toISOString() })
            .eq("asaas_subscription_id", assinaturaId);
          if (error) throw error;
        }
      }
    }

    // registra por último: se algo acima falhar, o Asaas reenvia e tentamos de novo
    if (evento.id) await admin.from("asaas_eventos").upsert({ id: evento.id, tipo }, { onConflict: "id" });
    return Response.json({ ok: true });
  } catch (e) {
    console.error("Falha no webhook do Asaas", tipo, e);
    return new Response("Erro ao processar", { status: 500 });
  }
}
