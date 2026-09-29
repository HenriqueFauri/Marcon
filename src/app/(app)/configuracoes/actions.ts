"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { falha, ok, texto, textoOuNull, type ActionResult } from "@/lib/action";
import { enviarNotificacao } from "@/lib/push/send";
import {
  EVENTOS,
  GRUPOS,
  MODELOS,
  MODELO_PERSONALIZADO,
  lerPreferencias,
  normalizarTexto,
  renderizar,
  textoDoEvento,
  type Texto,
} from "@/lib/notificacao-modelos";

export async function atualizarPerfil(formData: FormData): Promise<ActionResult> {
  try {
    const nome = texto(formData, "nome");
    if (!nome) return { ok: false, error: "Seu nome é obrigatório." };

    const supabase = await createClient();
    const { error } = await supabase.auth.updateUser({ data: { nome } });
    if (error) return falha(error);

    revalidatePath("/", "layout");
    return ok("Perfil atualizado.");
  } catch (e) {
    return falha(e);
  }
}

export async function atualizarEmpresa(formData: FormData): Promise<ActionResult> {
  try {
    const nomeNegocio = texto(formData, "nome_negocio");
    if (!nomeNegocio) return { ok: false, error: "O nome do negócio é obrigatório." };

    const supabase = await createClient();
    const { error } = await supabase.auth.updateUser({
      data: {
        nome_negocio: nomeNegocio,
        empresa_telefone: textoOuNull(formData, "empresa_telefone"),
        empresa_email: textoOuNull(formData, "empresa_email"),
        empresa_endereco: textoOuNull(formData, "empresa_endereco"),
        empresa_documento: textoOuNull(formData, "empresa_documento"),
      },
    });
    if (error) return falha(error);

    // o nome do negócio aparece na barra lateral de todas as telas
    revalidatePath("/", "layout");
    return ok("Dados da empresa salvos.");
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
    if (modelo !== MODELO_PERSONALIZADO && !MODELOS.some((m) => m.id === modelo)) {
      return { ok: false, error: "Escolha um modelo válido." };
    }

    let bruto: Record<string, { titulo?: unknown; corpo?: unknown }> = {};
    let desativados: unknown[] = [];
    try {
      bruto = JSON.parse(String(formData.get("personalizados") ?? "{}"));
      desativados = JSON.parse(String(formData.get("desativados") ?? "[]"));
    } catch {
      return { ok: false, error: "Não foi possível ler as opções. Recarregue a página." };
    }

    // textos personalizados: só guarda quando o modelo é o personalizado
    const personalizados: Record<string, Texto> = {};
    if (modelo === MODELO_PERSONALIZADO) {
      for (const evento of EVENTOS) {
        const t = bruto[evento.id];
        const titulo = normalizarTexto(String(t?.titulo ?? ""));
        const corpo = normalizarTexto(String(t?.corpo ?? ""));
        if (!titulo) return { ok: false, error: `Escreva o título da notificação “${evento.rotulo}”.` };
        if (titulo.length > 80) return { ok: false, error: `O título de “${evento.rotulo}” pode ter até 80 caracteres.` };
        if (corpo.length > 300) return { ok: false, error: `O texto de “${evento.rotulo}” pode ter até 300 caracteres.` };
        personalizados[evento.id] = { titulo, corpo };
      }
    }

    const idsGrupo = GRUPOS.map((g) => g.id as string);
    const desligados = desativados.filter((g): g is string => typeof g === "string" && idsGrupo.includes(g));

    const supabase = await createClient();
    const { error } = await supabase.auth.updateUser({
      data: {
        notif_modelo: modelo,
        notif_custom: modelo === MODELO_PERSONALIZADO ? personalizados : null,
        notif_desativados: desligados,
        // campos do formato antigo (só a venda)
        notif_titulo: null,
        notif_corpo: null,
      },
    });
    if (error) return falha(error);

    revalidatePath("/configuracoes");
    return ok("Notificações salvas.");
  } catch (e) {
    return falha(e);
  }
}

// Envia para os dispositivos do usuário um exemplo do evento, com o modelo já salvo.
export async function enviarNotificacaoTeste(eventoId: string): Promise<ActionResult> {
  try {
    const evento = EVENTOS.find((e) => e.id === eventoId);
    if (!evento) return { ok: false, error: "Evento inválido." };

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Sua sessão expirou. Entre novamente." };

    const { count } = await supabase.from("push_subscriptions").select("id", { count: "exact", head: true });
    if (!count) return { ok: false, error: "Ative as notificações neste dispositivo antes de testar." };

    const { titulo, corpo } = textoDoEvento(lerPreferencias(user.user_metadata), evento.id);
    const r = renderizar(titulo, corpo, evento.exemplo);
    await enviarNotificacao(user.id, r.titulo, r.corpo, "/");
    return ok("Notificação de teste enviada.");
  } catch (e) {
    return falha(e);
  }
}
