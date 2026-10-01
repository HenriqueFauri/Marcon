"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ehAdmin } from "@/lib/admin";
import { cancelarAssinatura as cancelarNoAsaas } from "@/lib/asaas";
import { falha, ok, type ActionResult } from "@/lib/action";
import { PLANO_PADRAO } from "@/lib/planos";

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
