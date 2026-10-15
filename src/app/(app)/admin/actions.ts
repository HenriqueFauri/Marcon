"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { adminConfirmado, ehAdmin, registrarAdmin } from "@/lib/admin";
import { cancelarAssinatura as cancelarNoAsaas } from "@/lib/asaas";
import { falha, ok, type ActionResult } from "@/lib/action";
import { PLANO_PADRAO } from "@/lib/planos";
import { ehMotivoCortesia, ehPrazoCortesia } from "@/lib/cortesia";
import { formatData, hojeISO, somarDias } from "@/lib/format";
import { enviarNotificacao } from "@/lib/push/send";
import { COMISSAO_MAXIMA, COMISSAO_PERCENTUAL } from "@/lib/indicacao";

// Toda ação confere de novo se quem chama é admin: server actions são rotas
// públicas, esconder o botão não basta.
async function contextoAdmin(alvoId: string, opcoes: { permitirAdmin?: boolean } = {}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!(await adminConfirmado(user))) throw new Error("Acesso restrito.");

  const admin = createAdminClient();
  if (!admin) throw new Error("SUPABASE_SERVICE_ROLE_KEY não configurada no servidor.");

  const { data, error } = await admin.auth.admin.getUserById(alvoId);
  if (error || !data.user) throw new Error("Conta não encontrada.");
  // bloquear a própria conta ou a de outro admin não é permitido; a cortesia é, porque o banco não conhece ADMIN_EMAILS
  if (!opcoes.permitirAdmin && (data.user.id === user!.id || ehAdmin(data.user))) throw new Error("Contas de admin não podem ser bloqueadas.");

  return { admin, alvo: data.user, adminId: user!.id };
}

// bloqueio pelo Supabase Auth: a pessoa não entra mais, e os dados ficam intactos
export async function bloquearConta(id: string, bloquear: boolean): Promise<ActionResult> {
  try {
    const { admin, adminId } = await contextoAdmin(id);
    const { error } = await admin.auth.admin.updateUserById(id, { ban_duration: bloquear ? "876000h" : "none" });
    if (error) throw error;
    await registrarAdmin(adminId, bloquear ? "bloquear_conta" : "desbloquear_conta", id);
    revalidatePath("/admin");
    return ok(bloquear ? "Conta bloqueada. Os dados continuam guardados." : "Conta desbloqueada.");
  } catch (e) {
    return falha(e);
  }
}

// Cortesia: o plano Marcon sem cobrança, por 7, 15 ou 30 dias (contando o dia de hoje) e com um motivo.
// Dar de novo a quem já tem cortesia renova o prazo a partir de hoje. Tirar encerra na hora.
export async function definirCortesia(
  id: string,
  liberar: boolean,
  opcoes?: { dias: number; motivo: string },
): Promise<ActionResult> {
  try {
    const { admin, adminId } = await contextoAdmin(id, { permitirAdmin: true });
    const { data: atual, error: erroLeitura } = await admin
      .from("assinaturas")
      .select("status, asaas_subscription_id")
      .eq("owner_id", id)
      .maybeSingle();
    if (erroLeitura) throw erroLeitura;

    let ate: string | null = null;
    if (liberar) {
      if (!opcoes || !ehPrazoCortesia(opcoes.dias)) return { ok: false, error: "Escolha o prazo: 7, 15 ou 30 dias." };
      if (!ehMotivoCortesia(opcoes.motivo)) return { ok: false, error: "Escolha o motivo da cortesia." };
      if (atual?.status === "ativa" || atual?.status === "atrasada") {
        return { ok: false, error: "Essa conta paga pelo Asaas. Cancele a assinatura dela antes de dar cortesia." };
      }
      // começou a assinar e não pagou: a cobrança deixa de fazer sentido
      if (atual?.status === "pendente" && atual.asaas_subscription_id) {
        await cancelarNoAsaas(atual.asaas_subscription_id).catch(() => null);
      }
      // "7 dias" conta o dia de hoje: vale até daqui a 6 dias, esse dia incluído
      ate = somarDias(hojeISO(), opcoes.dias - 1);
      const { error } = await admin.from("assinaturas").upsert(
        {
          owner_id: id,
          plano: PLANO_PADRAO,
          status: "cortesia",
          asaas_subscription_id: null,
          proximo_vencimento: null,
          cortesia_ate: ate,
          cortesia_motivo: opcoes.motivo,
          cortesia_por: adminId,
          cortesia_em: new Date().toISOString(),
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

    await registrarAdmin(adminId, liberar ? "dar_cortesia" : "tirar_cortesia", id, liberar ? { dias: opcoes?.dias, motivo: opcoes?.motivo, ate } : undefined);

    // o cliente fica sabendo na hora (se tiver notificações ligadas); a falha do aviso não desfaz a cortesia
    if (liberar && ate && opcoes) {
      await enviarNotificacao(
        id,
        "Plano Marcon liberado",
        `Você ganhou ${opcoes.dias} dias do plano Marcon, sem cobrança. Vale até ${formatData(ate)}.`,
        "/assinatura",
        admin,
      ).catch(() => null);
    }

    revalidatePath("/admin");
    revalidatePath(`/admin/contas/${id}`);
    return ok(liberar ? `Cortesia de ${opcoes?.dias} dias liberada, até ${formatData(ate!)}.` : "Cortesia retirada.");
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
    if (!(await adminConfirmado(user))) throw new Error("Acesso restrito.");
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
    await registrarAdmin(user!.id, status === "pago" ? "pagar_saque" : "recusar_saque", null, { saque: id });

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
    if (!(await adminConfirmado(user))) throw new Error("Acesso restrito.");
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
    await registrarAdmin(user!.id, "comissao_afiliado", afiliadoId, { percentual });

    revalidatePath("/admin/indicacoes");
    revalidatePath("/indique");
    return ok(percentual === null ? `Voltou para o padrão (${COMISSAO_PERCENTUAL}%).` : `Comissão de ${percentual}% definida.`);
  } catch (e) {
    return falha(e);
  }
}

// Assistente no WhatsApp, conta por conta (tabela whatsapp_liberados, migration 0049):
// "nenhum" tira, "usar" libera as perguntas, "lancar" libera também lançar pelo WhatsApp.
export type NivelAssistente = "nenhum" | "usar" | "lancar";

export async function definirAssistente(id: string, nivel: NivelAssistente): Promise<ActionResult> {
  try {
    if (nivel !== "nenhum" && nivel !== "usar" && nivel !== "lancar") return { ok: false, error: "Opção inválida." };
    const { admin, adminId } = await contextoAdmin(id, { permitirAdmin: true });

    if (nivel === "nenhum") {
      // o vínculo do número fica guardado: liberar de novo volta a funcionar sem novo código
      const { error } = await admin.from("whatsapp_liberados").delete().eq("owner_id", id);
      if (error) throw error;
    } else {
      const { error } = await admin
        .from("whatsapp_liberados")
        .upsert({ owner_id: id, lancar: nivel === "lancar", liberado_por: adminId, liberado_em: new Date().toISOString() }, { onConflict: "owner_id" });
      if (error) throw error;
    }

    await registrarAdmin(adminId, `assistente_${nivel}`, id);
    revalidatePath("/admin");
    revalidatePath(`/admin/contas/${id}`);
    return ok(nivel === "nenhum" ? "Assistente desligado para esta conta." : nivel === "lancar" ? "Assistente liberado, com lançamentos." : "Assistente liberado, só perguntas.");
  } catch (e) {
    return falha(e);
  }
}
