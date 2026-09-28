"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function criarCliente(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("não autenticado");

  const nome = String(formData.get("nome") ?? "").trim();
  if (!nome) throw new Error("nome é obrigatório");

  const { error } = await supabase.from("clientes").insert({
    owner_id: user.id,
    nome,
    telefone: String(formData.get("telefone") ?? "").trim() || null,
    email: String(formData.get("email") ?? "").trim() || null,
    cpf_cnpj: String(formData.get("cpf_cnpj") ?? "").trim() || null,
    observacoes: String(formData.get("observacoes") ?? "").trim() || null,
  });
  if (error) throw error;

  revalidatePath("/clientes");
  revalidatePath("/vendas/novo");
}

export async function excluirCliente(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("clientes").delete().eq("id", id);
  if (error) throw error;

  revalidatePath("/clientes");
  revalidatePath("/vendas/novo");
}
