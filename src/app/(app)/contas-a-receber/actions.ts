"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { enviarNotificacao } from "@/lib/push/send";
import { falha, ok, type ActionResult } from "@/lib/action";
import { formatBRL, hojeISO } from "@/lib/format";

// Recebe a parcela inteira ou uma parte dela. O valor entra no caixa na data informada;
// se for parte, o resto continua em aberto (função receber_parcela, migration 0045).
export async function receberParcela(parcelaId: string, valor: number, data?: string): Promise<ActionResult> {
  try {
    if (!Number.isFinite(valor) || valor <= 0) return { ok: false, error: "Digite quanto você recebeu." };
    const dia = data && /^\d{4}-\d{2}-\d{2}$/.test(data) ? data : hojeISO();
    if (dia > hojeISO()) return { ok: false, error: "A data do recebimento não pode ser no futuro." };

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

    const { data: resultado, error } = await supabase.rpc("receber_parcela", {
      p_parcela_id: parcelaId,
      p_valor: Math.round(valor * 100) / 100,
      p_data_pagamento: dia,
    });
    if (error) return falha(error);

    const { recebido, restante } = (resultado ?? {}) as { recebido?: number; restante?: number };
    const entrou = Number(recebido ?? valor);
    const falta = Number(restante ?? 0);

    if (parcela) {
      const clienteNome = (parcela.vendas as unknown as { cliente_nome: string | null } | null)?.cliente_nome;
      after(() =>
        enviarNotificacao(
          user.id,
          falta > 0 ? "Parte da parcela recebida" : "Parcela recebida",
          `Parcela ${parcela.numero_parcela}: ${formatBRL(entrou)}${clienteNome ? ", " + clienteNome : ""}${falta > 0 ? `. Faltam ${formatBRL(falta)}` : ""}`,
          `/vendas/${parcela.venda_id}`,
        ).catch(() => {}),
      );
      revalidatePath(`/vendas/${parcela.venda_id}`);
    }

    revalidatePath("/contas-a-receber");
    revalidatePath("/fluxo-de-caixa");
    revalidatePath("/clientes");
    revalidatePath("/");
    return ok(
      falta > 0
        ? `Recebido ${formatBRL(entrou)} e lançado no caixa. Faltam ${formatBRL(falta)}.`
        : `Recebido ${formatBRL(entrou)} e lançado no caixa.`,
    );
  } catch (e) {
    return falha(e);
  }
}
