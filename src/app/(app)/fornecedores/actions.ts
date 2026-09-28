"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function criarFornecedor(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("não autenticado");

  const nome = String(formData.get("nome") ?? "").trim();
  if (!nome) throw new Error("nome é obrigatório");

  const { error } = await supabase.from("fornecedores").insert({
    owner_id: user.id,
    nome,
    telefone: String(formData.get("telefone") ?? "").trim() || null,
    email: String(formData.get("email") ?? "").trim() || null,
    observacoes: String(formData.get("observacoes") ?? "").trim() || null,
  });
  if (error) throw error;

  revalidatePath("/fornecedores");
  revalidatePath("/produtos");
}

export async function excluirFornecedor(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("fornecedores").delete().eq("id", id);
  if (error) throw error;

  revalidatePath("/fornecedores");
  revalidatePath("/produtos");
}
