"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { falha, ok, texto, textoOuNull, type ActionResult } from "@/lib/action";

function camposCliente(formData: FormData) {
  return {
    nome: texto(formData, "nome"),
    telefone: textoOuNull(formData, "telefone"),
    email: textoOuNull(formData, "email"),
    cpf_cnpj: textoOuNull(formData, "cpf_cnpj"),
    observacoes: textoOuNull(formData, "observacoes"),
  };
}

function revalidar() {
  revalidatePath("/clientes");
  revalidatePath("/vendas/novo");
}

export async function criarCliente(formData: FormData): Promise<ActionResult> {
  try {
    const campos = camposCliente(formData);
    if (!campos.nome) return { ok: false, error: "O nome é obrigatório." };

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Sua sessão expirou. Entre novamente." };

    const { error } = await supabase.from("clientes").insert({ owner_id: user.id, ...campos });
    if (error) return falha(error);

    revalidar();
    return ok();
  } catch (e) {
    return falha(e);
  }
}

export async function atualizarCliente(id: string, formData: FormData): Promise<ActionResult> {
  try {
    const campos = camposCliente(formData);
    if (!campos.nome) return { ok: false, error: "O nome é obrigatório." };

    const supabase = await createClient();
    const { error } = await supabase.from("clientes").update(campos).eq("id", id);
    if (error) return falha(error);

    revalidar();
    return ok();
  } catch (e) {
    return falha(e);
  }
}

export async function excluirCliente(id: string): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("clientes").delete().eq("id", id);
    if (error) return falha(error);

    revalidar();
    return ok();
  } catch (e) {
    return falha(e);
  }
}
