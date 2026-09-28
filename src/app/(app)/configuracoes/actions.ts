"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function criarCanal(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("não autenticado");

  const nome = String(formData.get("nome") ?? "").trim();
  if (!nome) throw new Error("nome é obrigatório");

  const { error } = await supabase
    .from("canais_venda")
    .upsert({ owner_id: user.id, nome }, { onConflict: "owner_id,nome" });
  if (error) throw error;

  revalidatePath("/configuracoes");
  revalidatePath("/vendas/novo");
  revalidatePath("/produtos");
}

export async function excluirCanal(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("canais_venda").delete().eq("id", id);
  if (error) throw error;

  revalidatePath("/configuracoes");
  revalidatePath("/vendas/novo");
  revalidatePath("/produtos");
}

export async function criarFormaPagamento(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("não autenticado");

  const nome = String(formData.get("nome") ?? "").trim();
  if (!nome) throw new Error("nome é obrigatório");

  const { error } = await supabase
    .from("formas_pagamento")
    .upsert({ owner_id: user.id, nome }, { onConflict: "owner_id,nome" });
  if (error) throw error;

  revalidatePath("/configuracoes");
  revalidatePath("/vendas/novo");
}

export async function excluirFormaPagamento(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("formas_pagamento").delete().eq("id", id);
  if (error) throw error;

  revalidatePath("/configuracoes");
  revalidatePath("/vendas/novo");
}
