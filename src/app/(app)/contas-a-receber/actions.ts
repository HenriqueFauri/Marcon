"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { enviarNotificacao } from "@/lib/push/send";
import { falha, ok, type ActionResult } from "@/lib/action";
import { formatBRL, hojeISO } from "@/lib/format";

export async function marcarParcelaPaga(parcelaId: string): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Sua sessão expirou. Entre novamente." };

    const { data: parcela } = await supabase
      .from("parcelas")
      .select("valor, numero_parcela, venda_id, vendas(cliente_nome)")
      .eq("id", parcelaId)
      .single();

    const { error } = await supabase.rpc("pagar_parcela", {
      p_parcela_id: parcelaId,
      p_data_pagamento: hojeISO(),
    });
    if (error) return falha(error);

    if (parcela) {
      const clienteNome = (parcela.vendas as unknown as { cliente_nome: string | null } | null)?.cliente_nome;
      after(() =>
        enviarNotificacao(
          user.id,
          "Parcela recebida",
          `Parcela ${parcela.numero_parcela} — ${formatBRL(parcela.valor)}${clienteNome ? " — " + clienteNome : ""}`,
          `/vendas/${parcela.venda_id}`,
        ).catch(() => {}),
      );
      revalidatePath(`/vendas/${parcela.venda_id}`);
    }

    revalidatePath("/contas-a-receber");
    revalidatePath("/fluxo-de-caixa");
    revalidatePath("/");
    return ok(parcela ? `Recebido ${formatBRL(parcela.valor)} — lançado no caixa.` : "Parcela marcada como paga.");
  } catch (e) {
    return falha(e);
  }
}
