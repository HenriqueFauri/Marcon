import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { iaDisponivel } from "@/lib/ia-anuncio";
import type { ProdutoAnuncio, ProdutoComEstoque, ProdutoFoto, ProdutoVariacao } from "@/types/domain";
import { Badge, PageHeader } from "@/components/ui";
import { lerUso } from "@/lib/uso";
import { AnunciosEditor } from "./anuncios-editor";
import { FotosSection } from "./fotos-section";

export async function generateMetadata({ params }: PageProps<"/anuncios/[id]">): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("produtos").select("nome").eq("id", id).maybeSingle();
  return { title: data?.nome ? `Anúncios de ${data.nome}` : "Anúncios" };
}

export default async function AnunciosProdutoPage({ params }: PageProps<"/anuncios/[id]">) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: produto }, { data: variacoesData }, { data: fotosData }, { data: anunciosData }, uso] =
    await Promise.all([
      supabase.from("produtos_com_estoque").select("*, categorias(nome)").eq("id", id).maybeSingle(),
      supabase.from("produto_variacoes").select("*").eq("produto_id", id).order("nome_combinacao"),
      supabase.from("produto_fotos").select("*").eq("produto_id", id).order("ordem").order("created_at"),
      // o anúncio do produto é a versão mais recente; as outras (de quando havia um anúncio por canal) ficam guardadas
      supabase.from("produto_anuncios").select("*").eq("produto_id", id).order("updated_at", { ascending: false }),
      lerUso(supabase),
    ]);

  if (!produto) notFound();

  const p = produto as ProdutoComEstoque;
  const variacoes = (variacoesData ?? []) as ProdutoVariacao[];
  const fotos = (fotosData ?? []) as ProdutoFoto[];
  const anuncios = (anunciosData ?? []) as ProdutoAnuncio[];
  const anuncio = anuncios.find((a) => a.variacao_id === null) ?? anuncios[0] ?? null;

  const { data: assinadas } = fotos.length
    ? await supabase.storage.from("produto-fotos").createSignedUrls(fotos.map((f) => f.path), 3600)
    : { data: [] };
  const fotosComUrl = fotos.map((foto, i) => ({
    id: foto.id,
    path: foto.path,
    variacao_id: foto.variacao_id,
    url: assinadas?.[i]?.signedUrl ?? null,
  }));

  return (
    <div className="mx-auto max-w-4xl pb-24 lg:pb-0">
      <PageHeader
        back={{ href: "/anuncios", label: "Anúncios" }}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {p.nome}
            {p.status === "inativo" && <Badge>Inativo</Badge>}
          </span>
        }
        description={[p.categorias?.nome, p.marca].filter(Boolean).join(" · ") || undefined}
      />

      <div className="flex flex-col gap-7">
      <FotosSection
        produtoId={p.id}
        nomeProduto={p.nome}
        fotos={fotosComUrl}
        variacoes={variacoes}
        maxFotos={uso?.limites.fotosPorItem}
      />
      <AnunciosEditor
        produtoId={p.id}
        anuncio={anuncio}
        iaDisponivel={iaDisponivel()}
        dados={{
          nome: p.nome,
          marca: p.marca,
          descricao: p.descricao,
          categoria: p.categorias?.nome ?? null,
          precoVarejo: Number(p.preco_varejo),
          unidade: p.unidade_medida,
          variacoes,
        }}
      />
      </div>
    </div>
  );
}
