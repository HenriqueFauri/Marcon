"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { falha, ok, texto, textoOuNull, type ActionResult } from "@/lib/action";
import { enviarNotificacao } from "@/lib/push/send";
import { BOAS_VINDAS_MAX, COR_PADRAO, COR_REGEX, SLUG_REGEX, normalizarWhatsapp } from "@/lib/vitrine";
import {
  CAMPOS_COBRANCA,
  CAMPOS_VENDA,
  EVENTOS,
  GRUPOS,
  lerPreferencias,
  montarExemplo,
  type Grupo,
} from "@/lib/notificacoes";

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

export async function salvarPreferenciasNotificacao(formData: FormData): Promise<ActionResult> {
  try {
    let desativados: unknown;
    let dados: { venda?: Record<string, unknown>; cobranca?: Record<string, unknown> };
    try {
      desativados = JSON.parse(String(formData.get("desativados") ?? "[]"));
      dados = JSON.parse(String(formData.get("dados") ?? "{}"));
    } catch {
      return { ok: false, error: "Não foi possível ler as opções. Recarregue a página." };
    }

    const idsGrupo = GRUPOS.map((g) => g.id);
    const desligados = (Array.isArray(desativados) ? desativados : []).filter((g): g is Grupo => idsGrupo.includes(g));
    const flag = (grupo: Record<string, unknown> | undefined, id: string) => grupo?.[id] === true;

    const supabase = await createClient();
    const { error } = await supabase.auth.updateUser({
      data: {
        notif_desativados: desligados,
        notif_dados: {
          venda: Object.fromEntries(CAMPOS_VENDA.map((c) => [c.id, flag(dados.venda, c.id)])),
          cobranca: Object.fromEntries(CAMPOS_COBRANCA.map((c) => [c.id, flag(dados.cobranca, c.id)])),
        },
        // escolha de estilo e textos próprios de versões anteriores: não existem mais
        notif_modelo: null,
        notif_custom: null,
        notif_titulo: null,
        notif_corpo: null,
      },
    });
    if (error) return falha(error);

    revalidatePath("/configuracoes");
    return ok("Preferências salvas.");
  } catch (e) {
    return falha(e);
  }
}

// Manda um aviso de exemplo (tipo e frase sorteados, dados fictícios) só para
// confirmar que as notificações chegam neste aparelho.
export async function enviarNotificacaoTeste(): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Sua sessão expirou. Entre novamente." };

    const { count } = await supabase.from("push_subscriptions").select("id", { count: "exact", head: true });
    if (!count) return { ok: false, error: "Ative as notificações neste dispositivo antes de testar." };

    const evento = EVENTOS[Math.floor(Math.random() * EVENTOS.length)];
    const { titulo, corpo } = montarExemplo(lerPreferencias(user.user_metadata), evento, Math.floor(Math.random() * 1000));
    await enviarNotificacao(user.id, titulo, corpo, "/");
    return ok("Teste enviado. Olhe as notificações do aparelho.");
  } catch (e) {
    return falha(e);
  }
}

export async function salvarVitrine(formData: FormData): Promise<ActionResult> {
  try {
    const slug = texto(formData, "slug").toLowerCase();
    const whatsapp = normalizarWhatsapp(texto(formData, "whatsapp"));
    const cor = texto(formData, "cor") || COR_PADRAO;
    const boasVindas = textoOuNull(formData, "boas_vindas");
    const ativa = formData.get("ativa") === "on";

    if (!SLUG_REGEX.test(slug))
      return { ok: false, error: "O endereço precisa ter de 3 a 40 letras minúsculas, números ou hífen." };
    if (!/^\d{10,15}$/.test(whatsapp)) return { ok: false, error: "Informe o WhatsApp com DDD." };
    if (!COR_REGEX.test(cor)) return { ok: false, error: "Escolha uma cor válida." };
    if (boasVindas && boasVindas.length > BOAS_VINDAS_MAX)
      return { ok: false, error: `A frase de boas-vindas tem no máximo ${BOAS_VINDAS_MAX} letras.` };

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Sua sessão expirou. Entre novamente." };

    const { error } = await supabase.from("vitrines").upsert(
      {
        owner_id: user.id,
        slug,
        whatsapp,
        cor,
        boas_vindas: boasVindas,
        ativa,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "owner_id" },
    );
    if (error) {
      if (/duplicate key|unique constraint/i.test(error.message))
        return { ok: false, error: "Esse endereço já está em uso. Escolha outro." };
      return falha(error);
    }

    revalidatePath("/configuracoes");
    revalidatePath(`/loja/${slug}`);
    return ok(ativa ? "Vitrine salva e no ar." : "Vitrine salva (desligada).");
  } catch (e) {
    return falha(e);
  }
}
