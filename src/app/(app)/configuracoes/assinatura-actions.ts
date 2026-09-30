"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { falha, ok, type ActionResult } from "@/lib/action";
import { asaasConfigurado, cancelarAssinatura as cancelarNoAsaas, criarAssinatura, criarCliente, linkDePagamento } from "@/lib/asaas";
import { ehPlano, PLANOS } from "@/lib/planos";
import { revalidatePath } from "next/cache";

export type ResultadoAssinar = { ok: true; url: string } | { ok: false; error: string };

function hojeEmBrasilia() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

export async function assinarPlano(plano: string, documento: string): Promise<ResultadoAssinar> {
  try {
    if (!ehPlano(plano)) return { ok: false, error: "Escolha um plano válido." };
    const cpfCnpj = documento.replace(/\D/g, "");
    if (cpfCnpj.length !== 11 && cpfCnpj.length !== 14) {
      return { ok: false, error: "Informe um CPF (11 números) ou CNPJ (14 números) válido." };
    }
    if (!asaasConfigurado()) return { ok: false, error: "A cobrança ainda não foi configurada no servidor." };

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Sua sessão expirou. Entre novamente." };

    const admin = createAdminClient();
    if (!admin) return { ok: false, error: "A cobrança ainda não foi configurada no servidor." };

    const { data: atual } = await admin.from("assinaturas").select("*").eq("owner_id", user.id).maybeSingle();
    if (atual?.status === "ativa" || atual?.status === "atrasada") {
      return { ok: false, error: "Você já tem uma assinatura. Cancele a atual para trocar de plano." };
    }

    // assinatura ainda não paga: reaproveita o mesmo link em vez de criar outra cobrança
    if (atual?.status === "pendente" && atual.asaas_subscription_id && atual.plano === plano) {
      const url = await linkDePagamento(atual.asaas_subscription_id);
      if (url) return { ok: true, url };
    }
    if (atual?.status === "pendente" && atual.asaas_subscription_id) {
      await cancelarNoAsaas(atual.asaas_subscription_id).catch(() => null);
    }

    const nome =
      (user.user_metadata?.nome as string | undefined) ||
      (user.user_metadata?.nome_negocio as string | undefined) ||
      user.email ||
      "Cliente Marcon";

    const clienteId =
      atual?.asaas_customer_id ??
      (await criarCliente({ nome, email: user.email ?? "", cpfCnpj, ownerId: user.id })).id;

    const dadosPlano = PLANOS[plano];
    const assinatura = await criarAssinatura({
      clienteId,
      valor: dadosPlano.valor,
      descricao: `Marcon — plano ${dadosPlano.nome}`,
      ownerId: user.id,
      primeiroVencimento: hojeEmBrasilia(),
    });

    const { error } = await admin.from("assinaturas").upsert(
      {
        owner_id: user.id,
        asaas_customer_id: clienteId,
        asaas_subscription_id: assinatura.id,
        plano,
        status: "pendente",
        proximo_vencimento: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "owner_id" },
    );
    if (error) throw error;

    const url = await linkDePagamento(assinatura.id);
    if (!url) return { ok: false, error: "A assinatura foi criada, mas o link de pagamento ainda não ficou pronto. Tente de novo em instantes." };

    revalidatePath("/configuracoes");
    return { ok: true, url };
  } catch (e) {
    const r = falha(e);
    return { ok: false, error: r.ok ? "Algo deu errado. Tente de novo." : r.error };
  }
}

export async function cancelarPlano(): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Sua sessão expirou. Entre novamente." };

    const admin = createAdminClient();
    if (!admin) return { ok: false, error: "A cobrança ainda não foi configurada no servidor." };

    const { data: atual } = await admin.from("assinaturas").select("*").eq("owner_id", user.id).maybeSingle();
    if (!atual?.asaas_subscription_id || atual.status === "cancelada") {
      return { ok: false, error: "Você não tem uma assinatura ativa." };
    }

    await cancelarNoAsaas(atual.asaas_subscription_id);
    const { error } = await admin
      .from("assinaturas")
      .update({ status: "cancelada", updated_at: new Date().toISOString() })
      .eq("owner_id", user.id);
    if (error) throw error;

    revalidatePath("/configuracoes");
    return ok("Assinatura cancelada. Nenhuma nova cobrança será feita.");
  } catch (e) {
    return falha(e);
  }
}
