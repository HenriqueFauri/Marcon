"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function atualizarPerfil(formData: FormData) {
  const supabase = await createClient();
  const nome = String(formData.get("nome") ?? "").trim();
  const nomeNegocio = String(formData.get("nome_negocio") ?? "").trim();
  if (!nome) throw new Error("seu nome é obrigatório");
  if (!nomeNegocio) throw new Error("nome do negócio é obrigatório");

  const { error } = await supabase.auth.updateUser({ data: { nome, nome_negocio: nomeNegocio } });
  if (error) throw error;

  revalidatePath("/", "layout");
}

export async function atualizarEmpresa(formData: FormData) {
  const supabase = await createClient();

  const { error } = await supabase.auth.updateUser({
    data: {
      empresa_telefone: String(formData.get("empresa_telefone") ?? "").trim() || null,
      empresa_email: String(formData.get("empresa_email") ?? "").trim() || null,
      empresa_endereco: String(formData.get("empresa_endereco") ?? "").trim() || null,
      empresa_documento: String(formData.get("empresa_documento") ?? "").trim() || null,
    },
  });
  if (error) throw error;

  revalidatePath("/configuracoes");
}

export async function atualizarLogoEmpresa(path: string | null) {
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ data: { empresa_logo_path: path } });
  if (error) throw error;

  revalidatePath("/configuracoes");
}

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
