// Fotos dos produtos e biblioteca de mídia da conta. Recebe o cliente Supabase já logado (RLS e
// políticas do Storage por dono, como no site). Separada do service worker para dar para testar
// contra o Staging (teste/midias-staging.ts). Só baixa o arquivo que o dono pediu para anexar.
import type { SupabaseClient } from "@supabase/supabase-js";
import { paraBase64, deBase64, type ArquivoAnexo } from "./base64.ts";
import type { Resposta } from "./mensagens.ts";
import {
  BUCKET_MIDIAS,
  ERRO_BIBLIOTECA_CHEIA,
  FORMATOS,
  LIMITE_ARQUIVO,
  LIMITE_GRAVACAO_SEG,
  LIMITE_TITULO_MIDIA,
  caminhoDaMidia,
  conferirArquivo,
  conferirTituloMidia,
  erroDaMidiaNoBanco,
  extensaoDoCaminho,
  nomeParaEnvio,
  tituloDoArquivo,
  type Midia,
} from "./midias.ts";
import { ehUuid } from "./respostas.ts";

export interface MidiaPainel extends Midia {
  // miniatura assinada (só foto), vale 1 hora
  miniatura: string | null;
}

export interface FotoProduto {
  path: string;
  url: string;
  variacao: string | null;
}

const CAMPOS = "id, tipo, titulo, nome_arquivo, path, mime, tamanho, duracao, origem, resposta_id, created_at";
const SEM_SESSAO = "Sua sessão acabou. Entre de novo.";

async function logado(db: SupabaseClient): Promise<string | null> {
  const { data } = await db.auth.getSession();
  return data.session?.user.id ?? null;
}

export async function listarMidias(db: SupabaseClient): Promise<Resposta<MidiaPainel[]>> {
  if (!(await logado(db))) return { ok: false, erro: SEM_SESSAO };
  const { data, error } = await db.from("midias").select(CAMPOS).order("created_at", { ascending: false }).limit(200);
  if (error) return { ok: false, erro: "Não deu para carregar a mídia. Tente de novo." };
  const lista = (data ?? []) as Midia[];
  const fotos = lista.filter((m) => m.tipo === "imagem").map((m) => m.path);
  const urls = new Map<string, string>();
  if (fotos.length > 0) {
    const { data: assinadas } = await db.storage.from(BUCKET_MIDIAS).createSignedUrls(fotos, 3600);
    for (const a of assinadas ?? []) if (a.path && a.signedUrl) urls.set(a.path, a.signedUrl);
  }
  return { ok: true, dados: lista.map((m) => ({ ...m, tamanho: Number(m.tamanho), miniatura: urls.get(m.path) ?? null })) };
}

// Fotos de um produto, gerais primeiro, depois as de cada variação, na ordem do cadastro
export async function fotosDoProduto(db: SupabaseClient, produtoId: string): Promise<Resposta<FotoProduto[]>> {
  if (!(await logado(db))) return { ok: false, erro: SEM_SESSAO };
  const { data, error } = await db
    .from("produto_fotos")
    .select("path, ordem, created_at, variacao_id, produto_variacoes(nome_combinacao)")
    .eq("produto_id", produtoId)
    .order("ordem")
    .order("created_at")
    .limit(60);
  if (error) return { ok: false, erro: "Não deu para carregar as fotos. Tente de novo." };
  const linhas = (data ?? []) as unknown as {
    path: string;
    variacao_id: string | null;
    produto_variacoes: { nome_combinacao: string } | { nome_combinacao: string }[] | null;
  }[];
  linhas.sort((a, b) => Number(a.variacao_id !== null) - Number(b.variacao_id !== null));
  if (linhas.length === 0) return { ok: true, dados: [] };
  const { data: assinadas } = await db.storage.from("produto-fotos").createSignedUrls(linhas.map((l) => l.path), 3600);
  const urls = new Map((assinadas ?? []).map((a) => [a.path, a.signedUrl]));
  const nomeVariacao = (v: (typeof linhas)[number]["produto_variacoes"]) => (Array.isArray(v) ? v[0]?.nome_combinacao : v?.nome_combinacao) ?? null;
  return {
    ok: true,
    dados: linhas.flatMap((l) => {
      const url = urls.get(l.path);
      return url ? [{ path: l.path, url, variacao: l.variacao_id ? nomeVariacao(l.produto_variacoes) : null }] : [];
    }),
  };
}

async function baixar(db: SupabaseClient, bucket: string, path: string): Promise<{ base64: string; mime: string } | null> {
  const { data, error } = await db.storage.from(bucket).download(path);
  if (error || !data) return null;
  if (data.size > LIMITE_ARQUIVO) return null;
  return { base64: paraBase64(await data.arrayBuffer()), mime: data.type };
}

// Foto do produto: o Storage só entrega se o caminho é do próprio dono
export async function arquivoDaFoto(db: SupabaseClient, path: string, nomeProduto: string): Promise<Resposta<ArquivoAnexo>> {
  const dono = await logado(db);
  if (!dono) return { ok: false, erro: SEM_SESSAO };
  if (!path.startsWith(`${dono}/`)) return { ok: false, erro: "Foto não encontrada." };
  const r = await baixar(db, "produto-fotos", path);
  if (!r) return { ok: false, erro: "Não deu para baixar a foto. Tente de novo." };
  const ext = r.mime === "image/png" ? "png" : r.mime === "image/webp" ? "webp" : "jpg";
  return { ok: true, dados: { ...r, mime: r.mime || "image/jpeg", nome: nomeParaEnvio(nomeProduto, ext) } };
}

export async function arquivoDaMidia(db: SupabaseClient, id: string): Promise<Resposta<ArquivoAnexo>> {
  if (!(await logado(db))) return { ok: false, erro: SEM_SESSAO };
  const { data, error } = await db.from("midias").select("path, mime, nome_arquivo").eq("id", id).maybeSingle();
  if (error || !data) return { ok: false, erro: "Arquivo não encontrado. Atualize a lista." };
  const r = await baixar(db, BUCKET_MIDIAS, data.path as string);
  if (!r) return { ok: false, erro: "Não deu para baixar o arquivo. Tente de novo." };
  return { ok: true, dados: { base64: r.base64, mime: data.mime as string, nome: data.nome_arquivo as string } };
}

// Endereço para ouvir um áudio no painel (vale 10 minutos)
export async function urlDaMidia(db: SupabaseClient, id: string): Promise<Resposta<string>> {
  if (!(await logado(db))) return { ok: false, erro: SEM_SESSAO };
  const { data } = await db.from("midias").select("path").eq("id", id).maybeSingle();
  if (!data) return { ok: false, erro: "Arquivo não encontrado. Atualize a lista." };
  const { data: s } = await db.storage.from(BUCKET_MIDIAS).createSignedUrl(data.path as string, 600);
  return s?.signedUrl ? { ok: true, dados: s.signedUrl } : { ok: false, erro: "Não deu para abrir o áudio." };
}

export interface NovaGravacao {
  base64: string;
  ext: string;
  titulo: string;
  duracao: number;
}

// Áudio gravado no painel vai para a biblioteca, pelo mesmo caminho de um arquivo do computador
export async function salvarGravacao(db: SupabaseClient, g: NovaGravacao): Promise<Resposta<Midia>> {
  if (FORMATOS[g.ext]?.tipo !== "audio") return { ok: false, erro: "Formato de áudio não aceito." };
  const duracao = Math.max(0, Math.min(LIMITE_GRAVACAO_SEG + 5, Math.round(g.duracao)));
  const r = await subirMidia(db, { base64: g.base64, nome: `gravacao.${g.ext}`, mime: FORMATOS[g.ext].mime, titulo: g.titulo || "Áudio", duracao, origem: "gravacao" });
  if (!r.ok && r.erro === "O arquivo está vazio.") return { ok: false, erro: "A gravação ficou vazia." };
  return r;
}

export interface NovoArquivo {
  base64: string;
  nome: string; // nome do arquivo no computador (dá a extensão e o título)
  mime: string;
  titulo?: string; // sem título: o nome do arquivo, como no app
  duracao: number | null;
  origem?: "arquivo" | "gravacao";
}

// Arquivo novo na biblioteca: primeiro o arquivo no Storage (a política do bucket trava tipo, tamanho
// e o total da conta), depois o registro (o gatilho preparar_midia confere que o arquivo existe e pega
// dele tamanho e tipo). Se o registro falhar, o arquivo sai do Storage. Mesmo fluxo da tela do app.
export async function subirMidia(db: SupabaseClient, a: NovoArquivo): Promise<Resposta<Midia>> {
  const dono = await logado(db);
  if (!dono) return { ok: false, erro: SEM_SESSAO };
  const bytes = deBase64(a.base64);
  const conferido = conferirArquivo(a.nome, a.mime, bytes.length);
  if (!conferido.ok) return { ok: false, erro: conferido.erro };
  const formato = FORMATOS[conferido.ext];
  const titulo = conferirTituloMidia(String(a.titulo ?? "").replace(/\s+/g, " ").trim().slice(0, LIMITE_TITULO_MIDIA));
  const nome = titulo.ok ? titulo.titulo : tituloDoArquivo(a.nome);
  const duracaoBruta = a.duracao == null ? NaN : Number(a.duracao); // sem duração lida: null, não 0
  const duracao = formato.tipo === "audio" && Number.isFinite(duracaoBruta) && duracaoBruta >= 0 ? Math.min(900, Math.round(duracaoBruta)) : null;

  const path = caminhoDaMidia(dono, crypto.randomUUID(), conferido.ext);
  const subida = await db.storage
    .from(BUCKET_MIDIAS)
    .upload(path, new Blob([bytes], { type: formato.mime }), { contentType: formato.mime, upsert: false });
  if (subida.error) {
    if (/row-level|policy|unauthorized/i.test(subida.error.message)) return { ok: false, erro: ERRO_BIBLIOTECA_CHEIA };
    return { ok: false, erro: "Não deu para enviar o arquivo. Tente de novo." };
  }
  const { data, error } = await db
    .from("midias")
    .insert({
      owner_id: dono,
      tipo: formato.tipo,
      titulo: nome,
      nome_arquivo: nomeParaEnvio(nome, conferido.ext),
      path,
      mime: formato.mime,
      tamanho: bytes.length, // o gatilho troca pelo tamanho real do arquivo no Storage
      duracao,
      origem: a.origem ?? "arquivo",
    })
    .select(CAMPOS)
    .single();
  if (error || !data) {
    await db.storage.from(BUCKET_MIDIAS).remove([path]);
    return { ok: false, erro: erroDaMidiaNoBanco(error?.message ?? "") ?? "Não deu para enviar o arquivo. Tente de novo." };
  }
  return { ok: true, dados: { ...(data as Midia), tamanho: Number((data as Midia).tamanho) } };
}

// Editar um arquivo: nome (também o nome com que chega na conversa) e a resposta pronta ligada.
// Mesmas regras de salvarMidia do app; o gatilho de posse confere que a resposta é da conta.
export async function salvarMidia(db: SupabaseClient, id: string, bruto: string, respostaId: string | null): Promise<Resposta<{ id: string; titulo: string }>> {
  if (!(await logado(db))) return { ok: false, erro: SEM_SESSAO };
  if (!ehUuid(id)) return { ok: false, erro: "Arquivo não encontrado." };
  const conferido = conferirTituloMidia(bruto);
  if (!conferido.ok) return { ok: false, erro: conferido.erro };
  if (respostaId && !ehUuid(respostaId)) return { ok: false, erro: "Resposta pronta não encontrada." };
  const { data: atual } = await db.from("midias").select("path").eq("id", id).maybeSingle();
  if (!atual) return { ok: false, erro: "Arquivo não encontrado. Atualize a lista." };
  const { data, error } = await db
    .from("midias")
    .update({ titulo: conferido.titulo, nome_arquivo: nomeParaEnvio(conferido.titulo, extensaoDoCaminho(atual.path as string)), resposta_id: respostaId || null })
    .eq("id", id)
    .select("id, titulo");
  if (error) return { ok: false, erro: erroDaMidiaNoBanco(error.message) ?? "Não deu para salvar. Tente de novo." };
  if (!data || data.length === 0) return { ok: false, erro: "Arquivo não encontrado. Atualize a lista." };
  return { ok: true, dados: data[0] as { id: string; titulo: string } };
}

// Ligar (ou desligar, com null) um arquivo a uma resposta pronta, sem mudar o nome
export async function ligarMidia(db: SupabaseClient, id: string, respostaId: string | null): Promise<Resposta<null>> {
  if (!(await logado(db))) return { ok: false, erro: SEM_SESSAO };
  if (!ehUuid(id) || (respostaId && !ehUuid(respostaId))) return { ok: false, erro: "Arquivo não encontrado." };
  const { data, error } = await db.from("midias").update({ resposta_id: respostaId || null }).eq("id", id).select("id");
  if (error) return { ok: false, erro: erroDaMidiaNoBanco(error.message) ?? "Não deu para ligar o arquivo. Tente de novo." };
  if (!data || data.length === 0) return { ok: false, erro: "Arquivo não encontrado. Atualize a lista." };
  return { ok: true, dados: null };
}

// Apagar: o registro (a RLS só deixa o do dono) e depois o arquivo do Storage, como no app
export async function apagarMidia(db: SupabaseClient, id: string): Promise<Resposta<null>> {
  if (!(await logado(db))) return { ok: false, erro: SEM_SESSAO };
  if (!ehUuid(id)) return { ok: false, erro: "Arquivo não encontrado." };
  const { data, error } = await db.from("midias").delete().eq("id", id).select("path");
  if (error) return { ok: false, erro: "Não deu para apagar. Tente de novo." };
  if (!data || data.length === 0) return { ok: false, erro: "Arquivo não encontrado. Atualize a lista." };
  await db.storage.from(BUCKET_MIDIAS).remove([data[0].path as string]);
  return { ok: true, dados: null };
}

// para conferir no teste que o caminho guardado bate com o tipo
export function extensaoConfere(m: Pick<Midia, "path" | "mime">): boolean {
  return FORMATOS[extensaoDoCaminho(m.path)]?.mime === m.mime;
}

// Renomear um arquivo da biblioteca (o nome também é o nome do arquivo que chega na conversa)
export async function renomearMidia(db: SupabaseClient, id: string, bruto: string): Promise<Resposta<{ id: string; titulo: string }>> {
  if (!(await logado(db))) return { ok: false, erro: SEM_SESSAO };
  const conferido = conferirTituloMidia(String(bruto ?? "").replace(/\s+/g, " ").trim().slice(0, LIMITE_TITULO_MIDIA));
  if (!conferido.ok) return { ok: false, erro: conferido.erro };
  const titulo = conferido.titulo;
  const { data: atual } = await db.from("midias").select("path").eq("id", id).maybeSingle();
  if (!atual) return { ok: false, erro: "Arquivo não encontrado. Atualize a lista." };
  const { data, error } = await db
    .from("midias")
    .update({ titulo, nome_arquivo: nomeParaEnvio(titulo, extensaoDoCaminho(atual.path as string)) })
    .eq("id", id)
    .select("id, titulo");
  if (error || !data || data.length === 0) return { ok: false, erro: "Não deu para renomear. Tente de novo." };
  return { ok: true, dados: data[0] as { id: string; titulo: string } };
}
