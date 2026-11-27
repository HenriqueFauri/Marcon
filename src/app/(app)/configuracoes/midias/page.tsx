import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BUCKET_MIDIAS, type Midia, type TipoMidia } from "@/lib/midias";
import { BibliotecaMidia, type FiltroMidia } from "./biblioteca-midia";

export const metadata: Metadata = { title: "Biblioteca de mídia" };

const CAMPOS = "id, tipo, titulo, nome_arquivo, path, mime, tamanho, duracao, origem, resposta_id, created_at";
const FILTROS: Record<FiltroMidia, TipoMidia | null> = { tudo: null, fotos: "imagem", pdfs: "documento", audios: "audio" };

// Lista em /configuracoes/midias (?tipo=fotos|pdfs|audios); ?editar=<id> abre o arquivo.
export default async function MidiasPage({ searchParams }: PageProps<"/configuracoes/midias">) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data }, { data: respostas }] = await Promise.all([
    supabase.from("midias").select(CAMPOS).order("created_at", { ascending: false }),
    supabase.from("respostas_prontas").select("id, titulo").order("ordem").order("created_at"),
  ]);
  const midias = ((data ?? []) as Midia[]).map((m) => ({ ...m, tamanho: Number(m.tamanho) }));
  const usados = midias.reduce((s, m) => s + m.tamanho, 0);

  const editar = typeof sp.editar === "string" ? sp.editar : null;
  if (editar) {
    const midia = midias.find((m) => m.id === editar);
    if (!midia) redirect("/configuracoes/midias");
    const { data: assinada } = await supabase.storage.from(BUCKET_MIDIAS).createSignedUrl(midia.path, 3600);
    return (
      <BibliotecaMidia
        key={editar}
        midias={midias}
        usados={usados}
        respostas={(respostas ?? []) as { id: string; titulo: string }[]}
        filtro="tudo"
        editando={{ midia, url: assinada?.signedUrl ?? null }}
      />
    );
  }

  const filtro = (typeof sp.tipo === "string" && sp.tipo in FILTROS ? sp.tipo : "tudo") as FiltroMidia;
  const tipo = FILTROS[filtro];
  const visiveis = tipo ? midias.filter((m) => m.tipo === tipo) : midias;
  const fotos = visiveis.filter((m) => m.tipo === "imagem").map((m) => m.path);
  const miniaturas: Record<string, string> = {};
  if (fotos.length > 0) {
    const { data: assinadas } = await supabase.storage.from(BUCKET_MIDIAS).createSignedUrls(fotos, 3600);
    for (const a of assinadas ?? []) if (a.path && a.signedUrl) miniaturas[a.path] = a.signedUrl;
  }

  return (
    <BibliotecaMidia
      key={filtro}
      midias={midias}
      visiveis={visiveis}
      miniaturas={miniaturas}
      usados={usados}
      respostas={(respostas ?? []) as { id: string; titulo: string }[]}
      filtro={filtro}
    />
  );
}
