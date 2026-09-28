"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { enviarNotificacao } from "@/lib/push/send";

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export async function marcarParcelaPaga(parcelaId: string) {
  const supabase = await createClient();

  const { data: parcela } = await supabase
    .from("parcelas")
    .select("valor, numero_parcela, vendas(cliente_nome)")
    .eq("id", parcelaId)
    .single();

  const { error } = await supabase.rpc("pagar_parcela", {
    p_parcela_id: parcelaId,
    p_data_pagamento: new Date().toISOString().slice(0, 10),
  });
  if (error) throw error;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user && parcela) {
    const clienteNome = (parcela.vendas as unknown as { cliente_nome: string | null } | null)?.cliente_nome;
    enviarNotificacao(
      user.id,
      "Parcela paga",
      `Parcela ${parcela.numero_parcela} — ${formatBRL(parcela.valor)}${clienteNome ? " — " + clienteNome : ""}`,
      "/contas-a-receber",
    ).catch(() => {});
  }

  revalidatePath("/contas-a-receber");
  revalidatePath("/fluxo-de-caixa");
  revalidatePath("/");
}
