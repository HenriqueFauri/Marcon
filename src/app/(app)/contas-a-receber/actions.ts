"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function marcarParcelaPaga(parcelaId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("pagar_parcela", {
    p_parcela_id: parcelaId,
    p_data_pagamento: new Date().toISOString().slice(0, 10),
  });
  if (error) throw error;

  revalidatePath("/contas-a-receber");
  revalidatePath("/fluxo-de-caixa");
  revalidatePath("/");
}
