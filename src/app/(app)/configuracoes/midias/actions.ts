"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { falha, ok, texto, type ActionResult } from "@/lib/action";
import {
  BUCKET_MIDIAS,
  FORMATOS,
  LIMITE_TITULO_MIDIA,
  caminhoValido,
  extensaoDoCaminho,
  nomeParaEnvio,
} from "@/lib/midias";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function atualizar() {
  revalidatePath("/configuracoes/midias");
  revalidatePath("/configuracoes");
}

// mensagens do gatilho (limite da conta, arquivo sumido) já vêm em português
function erroDoBanco(e: { message?: string } | null): ActionResult {
  const m = e?.message ?? "";
  if (/Limite de 200|passou de 50 MB|Arquivo não encontrado/.test(m)) return { ok: false, error: m };
  if (/relacionado/.test(m)) return { ok: false, error: "Resposta pronta não encontrada." };
  return falha(e);
}

// O arquivo já subiu direto do navegador para a pasta do dono no Storage (a política do bucket
// trava tipo, tamanho e o total da conta). Aqui só o registro; o banco lê do Storage o tamanho e
// o tipo de verdade e recusa se o arquivo não estiver lá.
export async function registrarMidia(dados: { path: string; titulo: string; duracao: number | null }): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Sua sessão expirou. Entre novamente." };

    const path = String(dados?.path ?? "");
    if (!caminhoValido(path, user.id)) return { ok: false, error: "Arquivo inválido. Envie de novo." };
    const ext = extensaoDoCaminho(path);
    const formato = FORMATOS[ext];
    const titulo = String(dados.titulo ?? "").replace(/\s+/g, " ").trim().slice(0, LIMITE_TITULO_MIDIA) || "Arquivo";
    const duracaoBruta = Number(dados.duracao);
    const duracao =
      formato.tipo === "audio" && Number.isFinite(duracaoBruta) && duracaoBruta >= 0 ? Math.min(900, Math.round(duracaoBruta)) : null;

    const { data, error } = await supabase
      .from("midias")
      .insert({
        owner_id: user.id,
        tipo: formato.tipo,
        titulo,
        nome_arquivo: nomeParaEnvio(titulo, ext),
        path,
        mime: formato.mime,
        tamanho: 1, // o gatilho troca pelo tamanho real do arquivo no Storage
        duracao,
        origem: "arquivo",
      })
      .select("id")
      .single();
    if (error) return erroDoBanco(error);
    atualizar();
    return { ok: true, message: "Arquivo adicionado.", id: data.id as string };
  } catch (e) {
    return falha(e);
  }
}

// muda só o título (e com ele o nome do arquivo na conversa) e a resposta pronta ligada
export async function salvarMidia(formData: FormData): Promise<ActionResult> {
  try {
    const id = texto(formData, "id");
    const titulo = texto(formData, "titulo").replace(/\s+/g, " ");
    const resposta = texto(formData, "resposta_id");
    if (!UUID.test(id)) return { ok: false, error: "Arquivo não encontrado." };
    if (!titulo) return { ok: false, error: "Dê um nome para o arquivo." };
    if (titulo.length > LIMITE_TITULO_MIDIA) return { ok: false, error: `O nome vai até ${LIMITE_TITULO_MIDIA} letras.` };
    if (resposta && !UUID.test(resposta)) return { ok: false, error: "Resposta pronta não encontrada." };

    const supabase = await createClient();
    const { data: atual } = await supabase.from("midias").select("path").eq("id", id).maybeSingle();
    if (!atual) return { ok: false, error: "Arquivo não encontrado." };
    const { data, error } = await supabase
      .from("midias")
      .update({ titulo, nome_arquivo: nomeParaEnvio(titulo, extensaoDoCaminho(atual.path as string)), resposta_id: resposta || null })
      .eq("id", id)
      .select("id");
    if (error) return erroDoBanco(error);
    if (!data || data.length === 0) return { ok: false, error: "Arquivo não encontrado." };
    atualizar();
    return ok("Arquivo salvo.");
  } catch (e) {
    return falha(e);
  }
}

// apaga o registro (a RLS só deixa o do dono) e depois o arquivo do Storage
export async function apagarMidia(id: string): Promise<ActionResult> {
  try {
    if (!UUID.test(id)) return { ok: false, error: "Arquivo não encontrado." };
    const supabase = await createClient();
    const { data, error } = await supabase.from("midias").delete().eq("id", id).select("path");
    if (error) return falha(error);
    if (!data || data.length === 0) return { ok: false, error: "Arquivo não encontrado." };
    await supabase.storage.from(BUCKET_MIDIAS).remove([data[0].path as string]);
    atualizar();
    return ok("Arquivo apagado.");
  } catch (e) {
    return falha(e);
  }
}

// arquivo que subiu mas não virou registro (erro no meio): sai do Storage para não ocupar espaço
export async function descartarEnvio(path: string): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || !caminhoValido(String(path), user.id)) return ok();
    const { count } = await supabase.from("midias").select("id", { count: "exact", head: true }).eq("path", path);
    if ((count ?? 0) === 0) await supabase.storage.from(BUCKET_MIDIAS).remove([path]);
    return ok();
  } catch (e) {
    return falha(e);
  }
}
