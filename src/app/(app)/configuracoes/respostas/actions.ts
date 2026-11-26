"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { falha, ok, texto, type ActionResult } from "@/lib/action";
import { EXEMPLOS, LIMITE_ATALHO, LIMITE_RESPOSTAS, LIMITE_TEXTO, LIMITE_TITULO, normalizarAtalho } from "@/lib/respostas";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function erroDoBanco(e: { message?: string; code?: string } | null): ActionResult {
  if (e?.code === "23505" || /respostas_prontas_owner_id_atalho_key/.test(e?.message ?? "")) {
    return { ok: false, error: "Já existe uma resposta com esse atalho." };
  }
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
    const titulo = texto(formData, "titulo");
    const corpo = String(formData.get("texto") ?? "").replace(/\r\n?/g, "\n").trim();
    const atalhoBruto = texto(formData, "atalho");
    const atalho = atalhoBruto ? normalizarAtalho(atalhoBruto) : "";

    if (!titulo) return { ok: false, error: "Dê um título para a resposta." };
    if (titulo.length > LIMITE_TITULO) return { ok: false, error: `O título vai até ${LIMITE_TITULO} letras.` };
    if (!corpo) return { ok: false, error: "Escreva o texto da resposta." };
    if (corpo.length > LIMITE_TEXTO) return { ok: false, error: `O texto vai até ${LIMITE_TEXTO} letras.` };
    if (atalhoBruto && !atalho) return { ok: false, error: `O atalho usa só letras e números, até ${LIMITE_ATALHO}.` };
    if (id && !UUID.test(id)) return { ok: false, error: "Resposta não encontrada." };

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Sua sessão expirou. Entre novamente." };

    const dados = { titulo, texto: corpo, atalho: atalho || null };
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
    const ordem = Math.min(10000, ((ultima?.ordem as number | undefined) ?? -1) + 1);
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
    if (!UUID.test(id)) return { ok: false, error: "Resposta não encontrada." };
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
    if (!Array.isArray(ids) || ids.length > LIMITE_RESPOSTAS || !ids.every((i) => typeof i === "string" && UUID.test(i))) {
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
    const { error } = await supabase
      .from("respostas_prontas")
      .insert(EXEMPLOS.map((e, i) => ({ ...e, owner_id: user.id, ordem: i })));
    if (error) return erroDoBanco(error);
    atualizar();
    return ok("Exemplos criados. Edite do seu jeito.");
  } catch (e) {
    return falha(e);
  }
}
