// Criar, editar, apagar e ordenar respostas prontas e sequências pelo painel. As travas são as mesmas
// das telas do app: as funções conferir* de ../../src/lib (as server actions usam as mesmas) e, no
// banco, RLS do dono, gatilho de posse e limites por conta (migrations 0073 e 0076). Recebe o cliente
// Supabase já logado. Testado contra o Staging em teste/gestao-staging.ts.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Resposta } from "./mensagens.ts";
import {
  ERRO_ATALHO_REPETIDO,
  LIMITE_RESPOSTAS,
  atalhoRepetido,
  conferirResposta,
  ehUuid,
  idsParaOrdenar,
  proximaOrdem,
} from "./respostas.ts";
import { LIMITE_PASSOS, LIMITE_SEQUENCIAS, conferirPasso, conferirTituloSequencia } from "./sequencias.ts";

const SEM_SESSAO = "Sua sessão acabou. Entre de novo.";

async function dono(db: SupabaseClient): Promise<string | null> {
  const { data } = await db.auth.getSession();
  return data.session?.user.id ?? null;
}

// mensagens do banco: limites por conta já vêm em português (gatilhos das migrations)
function erroDoBanco(e: { message?: string; code?: string } | null, padrao: string): string {
  const m = e?.message ?? "";
  if (/Limite de|Não dá para|precisa de um texto|Lista grande/.test(m)) return m;
  if (/relacionado/.test(m)) return "A resposta ou o arquivo escolhido não existe mais. Atualize a lista.";
  return padrao;
}

async function ultimaOrdem(db: SupabaseClient, tabela: string, filtro?: [string, string]): Promise<number | undefined> {
  let q = db.from(tabela).select("ordem").order("ordem", { ascending: false }).limit(1);
  if (filtro) q = q.eq(filtro[0], filtro[1]);
  const { data } = await q.maybeSingle();
  return (data?.ordem as number | undefined) ?? undefined;
}

// ---------------------------------------------------------------------------------------------
// Respostas prontas

export interface RespostaEditada {
  id?: string;
  titulo: string;
  texto: string;
  atalho: string;
}

export async function salvarResposta(db: SupabaseClient, r: RespostaEditada): Promise<Resposta<{ id: string }>> {
  const owner = await dono(db);
  if (!owner) return { ok: false, erro: SEM_SESSAO };
  const conferida = conferirResposta(r);
  if (!conferida.ok) return { ok: false, erro: conferida.erro };
  if (r.id && !ehUuid(r.id)) return { ok: false, erro: "Resposta não encontrada." };
  const falhou = (e: { message?: string; code?: string } | null) =>
    ({ ok: false, erro: atalhoRepetido(e) ? ERRO_ATALHO_REPETIDO : erroDoBanco(e, "Não deu para salvar a resposta. Tente de novo.") }) as const;

  if (r.id) {
    const { data, error } = await db.from("respostas_prontas").update(conferida.dados).eq("id", r.id).select("id");
    if (error) return falhou(error);
    if (!data || data.length === 0) return { ok: false, erro: "Resposta não encontrada. Atualize a lista." };
    return { ok: true, dados: { id: r.id } };
  }
  const ordem = proximaOrdem(await ultimaOrdem(db, "respostas_prontas"));
  const { data, error } = await db
    .from("respostas_prontas")
    .insert({ ...conferida.dados, owner_id: owner, ordem })
    .select("id")
    .single();
  if (error || !data) return falhou(error);
  return { ok: true, dados: { id: data.id as string } };
}

export async function apagarResposta(db: SupabaseClient, id: string): Promise<Resposta<null>> {
  if (!(await dono(db))) return { ok: false, erro: SEM_SESSAO };
  if (!ehUuid(id)) return { ok: false, erro: "Resposta não encontrada." };
  const { data, error } = await db.from("respostas_prontas").delete().eq("id", id).select("id");
  if (error) return { ok: false, erro: "Não deu para apagar. Tente de novo." };
  if (!data || data.length === 0) return { ok: false, erro: "Resposta não encontrada. Atualize a lista." };
  return { ok: true, dados: null };
}

// a lista inteira na ordem nova; a função do banco só mexe nas do próprio dono
export async function reordenarRespostas(db: SupabaseClient, ids: string[]): Promise<Resposta<null>> {
  if (!(await dono(db))) return { ok: false, erro: SEM_SESSAO };
  if (!idsParaOrdenar(ids, LIMITE_RESPOSTAS)) return { ok: false, erro: "Não deu para mudar a ordem." };
  const { error } = await db.rpc("reordenar_respostas_prontas", { p_ids: ids });
  return error ? { ok: false, erro: "Não deu para mudar a ordem. Tente de novo." } : { ok: true, dados: null };
}

// ---------------------------------------------------------------------------------------------
// Sequências e passos

export async function salvarSequencia(db: SupabaseClient, s: { id?: string; titulo: string }): Promise<Resposta<{ id: string }>> {
  const owner = await dono(db);
  if (!owner) return { ok: false, erro: SEM_SESSAO };
  const conferido = conferirTituloSequencia(s.titulo);
  if (!conferido.ok) return { ok: false, erro: conferido.erro };
  if (s.id && !ehUuid(s.id)) return { ok: false, erro: "Sequência não encontrada." };
  if (s.id) {
    const { data, error } = await db.from("sequencias").update({ titulo: conferido.titulo }).eq("id", s.id).select("id");
    if (error) return { ok: false, erro: erroDoBanco(error, "Não deu para salvar o nome. Tente de novo.") };
    if (!data || data.length === 0) return { ok: false, erro: "Sequência não encontrada. Atualize a lista." };
    return { ok: true, dados: { id: s.id } };
  }
  const ordem = proximaOrdem(await ultimaOrdem(db, "sequencias"));
  const { data, error } = await db.from("sequencias").insert({ titulo: conferido.titulo, owner_id: owner, ordem }).select("id").single();
  if (error || !data) return { ok: false, erro: erroDoBanco(error, "Não deu para criar a sequência. Tente de novo.") };
  return { ok: true, dados: { id: data.id as string } };
}

export async function apagarSequencia(db: SupabaseClient, id: string): Promise<Resposta<null>> {
  if (!(await dono(db))) return { ok: false, erro: SEM_SESSAO };
  if (!ehUuid(id)) return { ok: false, erro: "Sequência não encontrada." };
  const { data, error } = await db.from("sequencias").delete().eq("id", id).select("id");
  if (error) return { ok: false, erro: "Não deu para apagar. Tente de novo." };
  if (!data || data.length === 0) return { ok: false, erro: "Sequência não encontrada. Atualize a lista." };
  return { ok: true, dados: null };
}

export async function reordenarSequencias(db: SupabaseClient, ids: string[]): Promise<Resposta<null>> {
  if (!(await dono(db))) return { ok: false, erro: SEM_SESSAO };
  if (!idsParaOrdenar(ids, LIMITE_SEQUENCIAS)) return { ok: false, erro: "Não deu para mudar a ordem." };
  const { error } = await db.rpc("reordenar_sequencias", { p_ids: ids });
  return error ? { ok: false, erro: "Não deu para mudar a ordem. Tente de novo." } : { ok: true, dados: null };
}

export interface PassoEditado {
  id?: string;
  sequenciaId: string;
  fonte: string;
  texto: string;
  respostaId: string;
  midiaId: string;
}

export async function salvarPasso(db: SupabaseClient, p: PassoEditado): Promise<Resposta<{ id: string }>> {
  const owner = await dono(db);
  if (!owner) return { ok: false, erro: SEM_SESSAO };
  if (!ehUuid(p.sequenciaId)) return { ok: false, erro: "Sequência não encontrada." };
  if (p.id && !ehUuid(p.id)) return { ok: false, erro: "Passo não encontrado." };
  const conferido = conferirPasso(p);
  if (!conferido.ok) return { ok: false, erro: conferido.erro };
  if (p.id) {
    const { data, error } = await db.from("sequencia_passos").update(conferido.dados).eq("id", p.id).eq("sequencia_id", p.sequenciaId).select("id");
    if (error) return { ok: false, erro: erroDoBanco(error, "Não deu para salvar o passo. Tente de novo.") };
    if (!data || data.length === 0) return { ok: false, erro: "Passo não encontrado. Atualize a lista." };
    return { ok: true, dados: { id: p.id } };
  }
  const ordem = proximaOrdem(await ultimaOrdem(db, "sequencia_passos", ["sequencia_id", p.sequenciaId]));
  const { data, error } = await db
    .from("sequencia_passos")
    .insert({ ...conferido.dados, sequencia_id: p.sequenciaId, owner_id: owner, ordem })
    .select("id")
    .single();
  if (error || !data) return { ok: false, erro: erroDoBanco(error, "Não deu para criar o passo. Tente de novo.") };
  return { ok: true, dados: { id: data.id as string } };
}

export async function apagarPasso(db: SupabaseClient, id: string): Promise<Resposta<null>> {
  if (!(await dono(db))) return { ok: false, erro: SEM_SESSAO };
  if (!ehUuid(id)) return { ok: false, erro: "Passo não encontrado." };
  const { data, error } = await db.from("sequencia_passos").delete().eq("id", id).select("id");
  if (error) return { ok: false, erro: "Não deu para apagar. Tente de novo." };
  if (!data || data.length === 0) return { ok: false, erro: "Passo não encontrado. Atualize a lista." };
  return { ok: true, dados: null };
}

export async function reordenarPassos(db: SupabaseClient, sequenciaId: string, ids: string[]): Promise<Resposta<null>> {
  if (!(await dono(db))) return { ok: false, erro: SEM_SESSAO };
  if (!ehUuid(sequenciaId) || !idsParaOrdenar(ids, LIMITE_PASSOS)) return { ok: false, erro: "Não deu para mudar a ordem." };
  const { error } = await db.rpc("reordenar_passos_sequencia", { p_sequencia: sequenciaId, p_ids: ids });
  return error ? { ok: false, erro: "Não deu para mudar a ordem. Tente de novo." } : { ok: true, dados: null };
}
