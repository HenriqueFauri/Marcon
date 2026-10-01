import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { CanalVenda, ProdutoAnuncio, ProdutoComEstoque, ProdutoFoto, ProdutoVariacao } from "@/types/domain";
import { Badge, Card, PageHeader, btnSecondary } from "@/components/ui";
import { lerUso } from "@/lib/uso";
import { FotosSection } from "../../produtos/[id]/fotos-section";
import { AnunciosEditor } from "./anuncios-editor";

export async function generateMetadata({ params }: PageProps<"/anuncios/[id]">): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("produtos").select("nome").eq("id", id).maybeSingle();
  return { title: data?.nome ? `Anúncios — ${data.nome}` : "Anúncios" };
}

export default async function AnunciosProdutoPage({ params }: PageProps<"/anuncios/[id]">) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: produto }, { data: variacoesData }, { data: fotosData }, { data: canaisData }, { data: anunciosData }, uso] =
    await Promise.all([
      supabase.from("produtos_com_estoque").select("*, categorias(nome)").eq("id", id).maybeSingle(),
      supabase.from("produto_variacoes").select("*").eq("produto_id", id).order("nome_combinacao"),
      supabase.from("produto_fotos").select("*").eq("produto_id", id).order("ordem").order("created_at"),
      supabase.from("canais_venda").select("*").order("nome"),
      supabase.from("produto_anuncios").select("*").eq("produto_id", id).order("created_at"),
      lerUso(supabase),
    ]);

  if (!produto) notFound();

  const p = produto as ProdutoComEstoque;
  const variacoes = (variacoesData ?? []) as ProdutoVariacao[];
  const fotos = (fotosData ?? []) as ProdutoFoto[];
  const canais = (canaisData ?? []) as CanalVenda[];
  const anuncios = (anunciosData ?? []) as ProdutoAnuncio[];

  const { data: assinadas } = fotos.length
    ? await supabase.storage.from("produto-fotos").createSignedUrls(fotos.map((f) => f.path), 3600)
    : { data: [] };
  const fotosComUrl = fotos.map((foto, i) => ({ id: foto.id, path: foto.path, url: assinadas?.[i]?.signedUrl ?? null }));

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        back={{ href: "/anuncios", label: "Anúncios" }}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {p.nome}
            {p.status === "inativo" && <Badge>Inativo</Badge>}
          </span>
        }
        description={[p.categorias?.nome ?? "Sem categoria", p.marca, p.sku ? `SKU ${p.sku}` : null].filter(Boolean).join(" · ")}
        action={
          <>
            <Link href={`/produtos/${p.id}`} className={btnSecondary}>
              Ver produto
            </Link>
          </>
        }
      />

      <div className="flex flex-col gap-6">
      <Card title="Fotos" description="A primeira é a capa. Adicione fotos aqui mesmo, copie e cole no anúncio ou baixe.">
        <FotosSection produtoId={p.id} fotos={fotosComUrl} maxFotos={uso?.limites.fotosPorItem} nomeProduto={p.nome} />
      </Card>

      <AnunciosEditor
        produtoId={p.id}
        canais={canais}
        anuncios={anuncios}
        variacoes={variacoes}
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
