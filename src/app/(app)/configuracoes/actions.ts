"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { falha, ok, texto, textoOuNull, type ActionResult } from "@/lib/action";

export async function atualizarPerfil(formData: FormData): Promise<ActionResult> {
  try {
    const nome = texto(formData, "nome");
    const nomeNegocio = texto(formData, "nome_negocio");
    if (!nome) return { ok: false, error: "Seu nome é obrigatório." };
    if (!nomeNegocio) return { ok: false, error: "O nome do negócio é obrigatório." };

    const supabase = await createClient();
    const { error } = await supabase.auth.updateUser({ data: { nome, nome_negocio: nomeNegocio } });
    if (error) return falha(error);

    revalidatePath("/", "layout");
    return ok("Perfil atualizado.");
  } catch (e) {
    return falha(e);
  }
}

export async function atualizarEmpresa(formData: FormData): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.updateUser({
      data: {
        empresa_telefone: textoOuNull(formData, "empresa_telefone"),
        empresa_email: textoOuNull(formData, "empresa_email"),
        empresa_endereco: textoOuNull(formData, "empresa_endereco"),
        empresa_documento: textoOuNull(formData, "empresa_documento"),
      },
    });
    if (error) return falha(error);

    revalidatePath("/configuracoes");
    return ok("Dados da empresa salvos.");
  } catch (e) {
    return falha(e);
  }
}

function valorMeta(formData: FormData, campo: string) {
  const bruto = String(formData.get(campo) ?? "").trim().replace(/\./g, "").replace(",", ".");
  if (!bruto) return null;
  const n = Number(bruto);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : NaN;
}

export async function atualizarMetas(formData: FormData): Promise<ActionResult> {
  try {
    const vendas = valorMeta(formData, "meta_vendas");
    const lucro = valorMeta(formData, "meta_lucro");
    if (Number.isNaN(vendas) || Number.isNaN(lucro)) {
      return { ok: false, error: "Digite um valor maior que zero, ou deixe em branco pra não ter meta." };
    }
    const supabase = await createClient();
    const { error } = await supabase.auth.updateUser({ data: { meta_vendas: vendas, meta_lucro: lucro } });
    if (error) return falha(error);

    revalidatePath("/", "layout");
    return ok("Metas salvas.");
  } catch (e) {
    return falha(e);
  }
}

export async function atualizarLogoEmpresa(path: string | null): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const anterior = user?.user_metadata?.empresa_logo_path as string | undefined;

    const { error } = await supabase.auth.updateUser({ data: { empresa_logo_path: path } });
    if (error) return falha(error);
    if (anterior && anterior !== path) await supabase.storage.from("logo-empresa").remove([anterior]);

    revalidatePath("/configuracoes");
    return ok(path ? "Logo atualizado." : "Logo removido.");
  } catch (e) {
    return falha(e);
  }
}

type TabelaSimples = "canais_venda" | "formas_pagamento";

async function criarItem(tabela: TabelaSimples, formData: FormData): Promise<ActionResult> {
  try {
    const nome = texto(formData, "nome");
    if (!nome) return { ok: false, error: "O nome é obrigatório." };

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Sua sessão expirou. Entre novamente." };

    const { error } = await supabase.from(tabela).upsert({ owner_id: user.id, nome }, { onConflict: "owner_id,nome" });
    if (error) return falha(error);

    revalidatePath("/configuracoes");
    revalidatePath("/vendas/novo");
    revalidatePath("/produtos", "layout");
    return ok(`“${nome}” adicionado.`);
  } catch (e) {
    return falha(e);
  }
}

async function excluirItem(tabela: TabelaSimples, id: string): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.from(tabela).delete().eq("id", id);
    if (error) return falha(error);

    revalidatePath("/configuracoes");
    revalidatePath("/vendas/novo");
    revalidatePath("/produtos", "layout");
    return ok("Removido.");
  } catch (e) {
    return falha(e);
  }
}

export async function criarCanal(formData: FormData) {
  return criarItem("canais_venda", formData);
}

export async function excluirCanal(id: string) {
  return excluirItem("canais_venda", id);
}

export async function criarFormaPagamento(formData: FormData) {
  return criarItem("formas_pagamento", formData);
}

export async function excluirFormaPagamento(id: string) {
  return excluirItem("formas_pagamento", id);
}
