"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ehAdmin } from "@/lib/admin";
import { cancelarAssinatura as cancelarNoAsaas } from "@/lib/asaas";
import { falha, ok, type ActionResult } from "@/lib/action";
import { PLANO_PADRAO } from "@/lib/planos";
import { COMISSAO_MAXIMA, COMISSAO_PERCENTUAL } from "@/lib/indicacao";

// Toda ação confere de novo se quem chama é admin: server actions são rotas
// públicas, esconder o botão não basta.
async function contextoAdmin(alvoId: string, opcoes: { permitirAdmin?: boolean } = {}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!ehAdmin(user)) throw new Error("Acesso restrito.");

  const admin = createAdminClient();
  if (!admin) throw new Error("SUPABASE_SERVICE_ROLE_KEY não configurada no servidor.");

  const { data, error } = await admin.auth.admin.getUserById(alvoId);
  if (error || !data.user) throw new Error("Conta não encontrada.");
  // bloquear a própria conta ou a de outro admin não é permitido; a cortesia é, porque o banco não conhece ADMIN_EMAILS
  if (!opcoes.permitirAdmin && (data.user.id === user!.id || ehAdmin(data.user))) throw new Error("Contas de admin não podem ser bloqueadas.");

  return { admin, alvo: data.user };
}

// bloqueio pelo Supabase Auth: a pessoa não entra mais, e os dados ficam intactos
export async function bloquearConta(id: string, bloquear: boolean): Promise<ActionResult> {
  try {
    const { admin } = await contextoAdmin(id);
    const { error } = await admin.auth.admin.updateUserById(id, { ban_duration: bloquear ? "876000h" : "none" });
    if (error) throw error;
    revalidatePath("/admin");
    return ok(bloquear ? "Conta bloqueada. Os dados continuam guardados." : "Conta desbloqueada.");
  } catch (e) {
    return falha(e);
  }
}

export async function definirCortesia(id: string, liberar: boolean): Promise<ActionResult> {
  try {
    const { admin } = await contextoAdmin(id, { permitirAdmin: true });
    const { data: atual, error: erroLeitura } = await admin
      .from("assinaturas")
      .select("status, asaas_subscription_id")
      .eq("owner_id", id)
      .maybeSingle();
    if (erroLeitura) throw erroLeitura;

    if (liberar) {
      if (atual?.status === "ativa" || atual?.status === "atrasada") {
        return { ok: false, error: "Essa conta paga pelo Asaas. Cancele a assinatura dela antes de dar cortesia." };
      }
      // começou a assinar e não pagou: a cobrança deixa de fazer sentido
      if (atual?.status === "pendente" && atual.asaas_subscription_id) {
        await cancelarNoAsaas(atual.asaas_subscription_id).catch(() => null);
      }
      const { error } = await admin.from("assinaturas").upsert(
        {
          owner_id: id,
          plano: PLANO_PADRAO,
          status: "cortesia",
          asaas_subscription_id: null,
          proximo_vencimento: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "owner_id" },
      );
      if (error) throw error;
    } else {
      if (atual?.status !== "cortesia") return { ok: false, error: "Essa conta não tem cortesia." };
      const { error } = await admin
        .from("assinaturas")
        .update({ status: "cancelada", updated_at: new Date().toISOString() })
        .eq("owner_id", id);
      if (error) throw error;
    }

    revalidatePath("/admin");
    return ok(liberar ? "Plano Marcon liberado como cortesia." : "Cortesia retirada.");
  } catch (e) {
    return falha(e);
  }
}

// Saques do "Indique e ganhe": o PIX é feito à mão, fora do app; aqui só se registra o resultado.
async function resolverSaque(id: string, status: "pago" | "recusado"): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!ehAdmin(user)) throw new Error("Acesso restrito.");
    const admin = createAdminClient();
    if (!admin) throw new Error("SUPABASE_SERVICE_ROLE_KEY não configurada no servidor.");

    // só sai de "pedido": marcar duas vezes, ou pagar um saque recusado, não acontece
    const { data, error } = await admin
      .from("saques")
      .update({ status, resolvido_em: new Date().toISOString() })
      .eq("id", id)
      .eq("status", "pedido")
      .select("id");
    if (error) throw error;
    if (!data?.length) return { ok: false, error: "Esse saque já foi resolvido." };

    revalidatePath("/admin/indicacoes");
    return ok(status === "pago" ? "Saque marcado como pago." : "Saque recusado. O valor volta para o saldo.");
  } catch (e) {
    return falha(e);
  }
}

export async function marcarSaquePago(id: string) {
  return resolverSaque(id, "pago");
}

export async function recusarSaque(id: string) {
  return resolverSaque(id, "recusado");
}

// Percentual negociado com um afiliado (influenciador etc.). null volta para o padrão.
// Vale para as comissões novas: as que já existem guardam o percentual com que nasceram.
export async function definirPercentualAfiliado(afiliadoId: string, percentual: number | null): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!ehAdmin(user)) throw new Error("Acesso restrito.");
    const admin = createAdminClient();
    if (!admin) throw new Error("SUPABASE_SERVICE_ROLE_KEY não configurada no servidor.");

    if (percentual !== null) {
      if (!Number.isFinite(percentual) || percentual < 1 || percentual > COMISSAO_MAXIMA) {
        return { ok: false, error: `Informe um percentual de 1 a ${COMISSAO_MAXIMA}.` };
      }
      percentual = Math.round(percentual * 100) / 100;
    }

    const { data, error } = await admin.from("afiliados").update({ percentual }).eq("owner_id", afiliadoId).select("owner_id");
    if (error) throw error;
    if (!data?.length) return { ok: false, error: "Afiliado não encontrado." };

    revalidatePath("/admin/indicacoes");
    revalidatePath("/indique");
    return ok(percentual === null ? `Voltou para o padrão (${COMISSAO_PERCENTUAL}%).` : `Comissão de ${percentual}% definida.`);
  } catch (e) {
    return falha(e);
  }
}
