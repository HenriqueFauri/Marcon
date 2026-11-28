"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { falha, ok, texto, type ActionResult } from "@/lib/action";
import { LIMITE_PASSOS, LIMITE_SEQUENCIAS, conferirPasso, conferirTituloSequencia } from "@/lib/sequencias";
import { ehUuid, idsParaOrdenar, proximaOrdem } from "@/lib/respostas";

function atualizar() {
  revalidatePath("/configuracoes/sequencias");
  revalidatePath("/configuracoes");
}

async function usuario() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

// cria (sem id) ou renomeia (com id). O banco repete o tamanho do título e o limite de 50 por conta.
export async function salvarSequencia(formData: FormData): Promise<ActionResult> {
  try {
    const id = texto(formData, "id");
    const conferido = conferirTituloSequencia(formData.get("titulo"));
    if (!conferido.ok) return { ok: false, error: conferido.erro };
    const titulo = conferido.titulo;
    if (id && !ehUuid(id)) return { ok: false, error: "Sequência não encontrada." };

    const { supabase, user } = await usuario();
    if (!user) return { ok: false, error: "Sua sessão expirou. Entre novamente." };

    if (id) {
      const { data, error } = await supabase.from("sequencias").update({ titulo }).eq("id", id).select("id");
      if (error) return falha(error);
      if (!data || data.length === 0) return { ok: false, error: "Sequência não encontrada." };
      atualizar();
      return { ok: true, message: "Nome salvo.", id };
    }

    const { data: ultima } = await supabase.from("sequencias").select("ordem").order("ordem", { ascending: false }).limit(1).maybeSingle();
    const ordem = proximaOrdem(ultima?.ordem as number | undefined);
    const { data, error } = await supabase.from("sequencias").insert({ titulo, owner_id: user.id, ordem }).select("id").single();
    if (error) return falha(error);
    atualizar();
    return { ok: true, message: "Sequência criada. Agora os passos.", id: data.id as string };
  } catch (e) {
    return falha(e);
  }
}

export async function apagarSequencia(id: string): Promise<ActionResult> {
  try {
    if (!ehUuid(id)) return { ok: false, error: "Sequência não encontrada." };
    const { supabase } = await usuario();
    const { data, error } = await supabase.from("sequencias").delete().eq("id", id).select("id");
    if (error) return falha(error);
    if (!data || data.length === 0) return { ok: false, error: "Sequência não encontrada." };
    atualizar();
    return ok("Sequência apagada.");
  } catch (e) {
    return falha(e);
  }
}

export async function reordenarSequencias(ids: string[]): Promise<ActionResult> {
  try {
    if (!idsParaOrdenar(ids, LIMITE_SEQUENCIAS)) {
      return { ok: false, error: "Não deu para mudar a ordem." };
    }
    const { supabase } = await usuario();
    const { error } = await supabase.rpc("reordenar_sequencias", { p_ids: ids });
    if (error) return falha(error);
    atualizar();
    return ok();
  } catch (e) {
    return falha(e);
  }
}

// Passo: texto escrito, ou resposta pronta, ou nada; e um arquivo da biblioteca, ou nenhum.
// O banco confere que a sequência, a resposta e o arquivo são da conta (gatilho de posse).
export async function salvarPasso(formData: FormData): Promise<ActionResult> {
  try {
    const id = texto(formData, "id");
    const sequenciaId = texto(formData, "sequencia_id");
    if (!ehUuid(sequenciaId)) return { ok: false, error: "Sequência não encontrada." };
    if (id && !ehUuid(id)) return { ok: false, error: "Passo não encontrado." };
    const conferido = conferirPasso({
      fonte: texto(formData, "fonte"),
      texto: formData.get("texto"),
      respostaId: texto(formData, "resposta_id"),
      midiaId: texto(formData, "midia_id"),
    });
    if (!conferido.ok) return { ok: false, error: conferido.erro };

    const { supabase, user } = await usuario();
    if (!user) return { ok: false, error: "Sua sessão expirou. Entre novamente." };

    const dados = conferido.dados;

    if (id) {
      const { data, error } = await supabase.from("sequencia_passos").update(dados).eq("id", id).eq("sequencia_id", sequenciaId).select("id");
      if (error) return falha(error);
      if (!data || data.length === 0) return { ok: false, error: "Passo não encontrado." };
      atualizar();
      return ok("Passo salvo.");
    }

    const { data: ultimo } = await supabase
      .from("sequencia_passos")
      .select("ordem")
      .eq("sequencia_id", sequenciaId)
      .order("ordem", { ascending: false })
      .limit(1)
      .maybeSingle();
    const ordem = proximaOrdem(ultimo?.ordem as number | undefined);
    const { error } = await supabase.from("sequencia_passos").insert({ ...dados, sequencia_id: sequenciaId, owner_id: user.id, ordem });
    if (error) return falha(error);
    atualizar();
    return ok("Passo criado.");
  } catch (e) {
    return falha(e);
  }
}

export async function apagarPasso(id: string): Promise<ActionResult> {
  try {
    if (!ehUuid(id)) return { ok: false, error: "Passo não encontrado." };
    const { supabase } = await usuario();
    const { data, error } = await supabase.from("sequencia_passos").delete().eq("id", id).select("id");
    if (error) return falha(error);
    if (!data || data.length === 0) return { ok: false, error: "Passo não encontrado." };
    atualizar();
    return ok("Passo apagado.");
  } catch (e) {
    return falha(e);
  }
}

export async function reordenarPassos(sequenciaId: string, ids: string[]): Promise<ActionResult> {
  try {
    if (!ehUuid(sequenciaId) || !idsParaOrdenar(ids, LIMITE_PASSOS)) {
      return { ok: false, error: "Não deu para mudar a ordem." };
    }
    const { supabase } = await usuario();
    const { error } = await supabase.rpc("reordenar_passos_sequencia", { p_sequencia: sequenciaId, p_ids: ids });
    if (error) return falha(error);
    atualizar();
    return ok();
  } catch (e) {
    return falha(e);
  }
}
