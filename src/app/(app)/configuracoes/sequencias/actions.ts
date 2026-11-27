"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { falha, ok, texto, type ActionResult } from "@/lib/action";
import { LIMITE_PASSOS, LIMITE_SEQUENCIAS, LIMITE_TEXTO_PASSO, LIMITE_TITULO_SEQUENCIA } from "@/lib/sequencias";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    const titulo = texto(formData, "titulo").replace(/\s+/g, " ");
    if (!titulo) return { ok: false, error: "Dê um nome para a sequência." };
    if (titulo.length > LIMITE_TITULO_SEQUENCIA) return { ok: false, error: `O nome vai até ${LIMITE_TITULO_SEQUENCIA} letras.` };
    if (id && !UUID.test(id)) return { ok: false, error: "Sequência não encontrada." };

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
    const ordem = Math.min(10000, ((ultima?.ordem as number | undefined) ?? -1) + 1);
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
    if (!UUID.test(id)) return { ok: false, error: "Sequência não encontrada." };
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
    if (!Array.isArray(ids) || ids.length > LIMITE_SEQUENCIAS || !ids.every((i) => typeof i === "string" && UUID.test(i))) {
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
    const fonte = texto(formData, "fonte");
    const corpo = String(formData.get("texto") ?? "").replace(/\r\n?/g, "\n").trim();
    const respostaId = texto(formData, "resposta_id");
    const midiaId = texto(formData, "midia_id");

    if (!UUID.test(sequenciaId)) return { ok: false, error: "Sequência não encontrada." };
    if (id && !UUID.test(id)) return { ok: false, error: "Passo não encontrado." };
    if (fonte !== "escrever" && fonte !== "resposta" && fonte !== "nenhum") return { ok: false, error: "Escolha o texto do passo." };
    if (fonte === "escrever" && !corpo) return { ok: false, error: "Escreva o texto do passo." };
    if (fonte === "escrever" && corpo.length > LIMITE_TEXTO_PASSO) return { ok: false, error: `O texto vai até ${LIMITE_TEXTO_PASSO} letras.` };
    if (fonte === "resposta" && !UUID.test(respostaId)) return { ok: false, error: "Escolha a resposta pronta." };
    if (midiaId && !UUID.test(midiaId)) return { ok: false, error: "Arquivo não encontrado." };
    if (fonte === "nenhum" && !midiaId) return { ok: false, error: "O passo precisa de um texto ou de um arquivo." };

    const { supabase, user } = await usuario();
    if (!user) return { ok: false, error: "Sua sessão expirou. Entre novamente." };

    const dados = {
      texto: fonte === "escrever" ? corpo : null,
      resposta_id: fonte === "resposta" ? respostaId : null,
      midia_id: midiaId || null,
    };

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
    const ordem = Math.min(10000, ((ultimo?.ordem as number | undefined) ?? -1) + 1);
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
    if (!UUID.test(id)) return { ok: false, error: "Passo não encontrado." };
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
    if (
      !UUID.test(sequenciaId) ||
      !Array.isArray(ids) ||
      ids.length > LIMITE_PASSOS ||
      !ids.every((i) => typeof i === "string" && UUID.test(i))
    ) {
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
