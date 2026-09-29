"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { falha, ok, texto, textoOuNull, type ActionResult } from "@/lib/action";
import { enviarNotificacao } from "@/lib/push/send";
import { EXEMPLO, MODELOS, MODELO_PERSONALIZADO, renderizarModelo, resolverModelo } from "@/lib/notificacao-modelos";

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

export async function salvarModeloNotificacao(formData: FormData): Promise<ActionResult> {
  try {
    const modelo = texto(formData, "modelo");
    const titulo = texto(formData, "titulo");
    const corpo = String(formData.get("corpo") ?? "").trim();

    if (modelo !== MODELO_PERSONALIZADO && !MODELOS.some((m) => m.id === modelo)) {
      return { ok: false, error: "Escolha um modelo válido." };
    }
    if (modelo === MODELO_PERSONALIZADO) {
      if (!titulo) return { ok: false, error: "Escreva o título da notificação." };
      if (titulo.length > 80) return { ok: false, error: "O título pode ter até 80 caracteres." };
      if (corpo.length > 300) return { ok: false, error: "O texto pode ter até 300 caracteres." };
    }

    const supabase = await createClient();
    const { error } = await supabase.auth.updateUser({
      data: {
        notif_modelo: modelo,
        notif_titulo: modelo === MODELO_PERSONALIZADO ? titulo : null,
        notif_corpo: modelo === MODELO_PERSONALIZADO ? corpo : null,
      },
    });
    if (error) return falha(error);

    revalidatePath("/configuracoes");
    return ok("Modelo de notificação salvo.");
  } catch (e) {
    return falha(e);
  }
}

// Envia para os dispositivos do usuário um exemplo com o modelo já salvo.
export async function enviarNotificacaoTeste(): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Sua sessão expirou. Entre novamente." };

    const { count } = await supabase.from("push_subscriptions").select("id", { count: "exact", head: true });
    if (!count) return { ok: false, error: "Ative as notificações neste dispositivo antes de testar." };

    const modelo = resolverModelo(user.user_metadata);
    const { titulo, corpo } = renderizarModelo(modelo.titulo, modelo.corpo, EXEMPLO);
    await enviarNotificacao(user.id, titulo, corpo, "/vendas");
    return ok("Notificação de teste enviada.");
  } catch (e) {
    return falha(e);
  }
}
