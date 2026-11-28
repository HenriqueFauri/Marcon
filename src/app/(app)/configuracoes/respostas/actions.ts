"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { falha, ok, texto, type ActionResult } from "@/lib/action";
import {
  LIMITE_RESPOSTAS,
  atalhoRepetido,
  conferirResposta,
  ehUuid,
  ERRO_ATALHO_REPETIDO,
  exemplosDaConta,
  idsParaOrdenar,
  proximaOrdem,
} from "@/lib/respostas";

function erroDoBanco(e: { message?: string; code?: string } | null): ActionResult {
  if (atalhoRepetido(e)) return { ok: false, error: ERRO_ATALHO_REPETIDO };
  return falha(e);
}

function atualizar() {
  revalidatePath("/configuracoes/respostas");
  revalidatePath("/configuracoes");
}

// cria (sem id) ou edita (com id). O banco repete as travas de tamanho, atalho e limite por conta.
export async function salvarResposta(formData: FormData): Promise<ActionResult> {
  try {
    const id = texto(formData, "id");
    const conferida = conferirResposta({ titulo: formData.get("titulo"), texto: formData.get("texto"), atalho: formData.get("atalho") });
    if (!conferida.ok) return { ok: false, error: conferida.erro };
    if (id && !ehUuid(id)) return { ok: false, error: "Resposta não encontrada." };

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Sua sessão expirou. Entre novamente." };

    const dados = conferida.dados;
    if (id) {
      // a RLS só deixa mexer na própria; sem linha de volta, não era dele (ou já foi apagada)
      const { data, error } = await supabase.from("respostas_prontas").update(dados).eq("id", id).select("id");
      if (error) return erroDoBanco(error);
      if (!data || data.length === 0) return { ok: false, error: "Resposta não encontrada." };
      atualizar();
      return ok("Resposta salva.");
    }

    // nova vai para o fim da lista
    const { data: ultima } = await supabase
      .from("respostas_prontas")
      .select("ordem")
      .order("ordem", { ascending: false })
      .limit(1)
      .maybeSingle();
    const ordem = proximaOrdem(ultima?.ordem as number | undefined);
    const { data, error } = await supabase
      .from("respostas_prontas")
      .insert({ ...dados, owner_id: user.id, ordem })
      .select("id")
      .single();
    if (error) return erroDoBanco(error);
    atualizar();
    return { ok: true, message: "Resposta criada.", id: data.id as string };
  } catch (e) {
    return falha(e);
  }
}

export async function apagarResposta(id: string): Promise<ActionResult> {
  try {
    if (!ehUuid(id)) return { ok: false, error: "Resposta não encontrada." };
    const supabase = await createClient();
    const { data, error } = await supabase.from("respostas_prontas").delete().eq("id", id).select("id");
    if (error) return falha(error);
    if (!data || data.length === 0) return { ok: false, error: "Resposta não encontrada." };
    atualizar();
    return ok("Resposta apagada.");
  } catch (e) {
    return falha(e);
  }
}

// a lista inteira na ordem nova; a função do banco só mexe nas do próprio dono
export async function reordenarRespostas(ids: string[]): Promise<ActionResult> {
  try {
    if (!idsParaOrdenar(ids, LIMITE_RESPOSTAS)) {
      return { ok: false, error: "Não deu para mudar a ordem." };
    }
    const supabase = await createClient();
    const { error } = await supabase.rpc("reordenar_respostas_prontas", { p_ids: ids });
    if (error) return falha(error);
    atualizar();
    return ok();
  } catch (e) {
    return falha(e);
  }
}

// estado vazio: cria os exemplos de uma vez, só se a lista ainda está vazia (dois cliques não duplicam)
export async function criarExemplos(): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Sua sessão expirou. Entre novamente." };
    const { count, error: erroContagem } = await supabase.from("respostas_prontas").select("id", { count: "exact", head: true });
    if (erroContagem) return falha(erroContagem);
    if ((count ?? 0) > 0) return ok();
    const { data: formas } = await supabase.from("formas_pagamento").select("nome").order("nome");
    const exemplos = exemplosDaConta((formas ?? []).map((f) => String(f.nome ?? "")));
    const { error } = await supabase
      .from("respostas_prontas")
      .insert(exemplos.map((e, i) => ({ ...e, owner_id: user.id, ordem: i })));
    if (error) return erroDoBanco(error);
    atualizar();
    return ok("Exemplos criados. Edite do seu jeito.");
  } catch (e) {
    return falha(e);
  }
}
