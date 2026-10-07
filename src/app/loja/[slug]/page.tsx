import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { formatBRL } from "@/lib/format";
import { enderecoDoApp } from "@/lib/indicacao-servidor";
import { buscarVitrine } from "@/lib/vitrine-servidor";
import { VITRINE_EXEMPLO } from "./exemplo";
import { Loja } from "./loja";

// Vitrine pública de um vendedor: abre sem login. Os dados vêm da função vitrine_publica
// (migration 0025), que devolve só o que o cliente deve ver: sem custo nem estoque exato.

// em desenvolvimento, /loja/exemplo mostra uma loja fictícia cheia (para ver o visual)
async function carregar(slug: string) {
  if (slug === "exemplo" && process.env.NODE_ENV !== "production") return VITRINE_EXEMPLO;
  return buscarVitrine(slug);
}

// a prévia do link (WhatsApp, Instagram) mostra a loja ou, com ?p=id, o produto com foto e preço
export async function generateMetadata({ params, searchParams }: PageProps<"/loja/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const { p } = await searchParams;
  const vitrine = await carregar(slug);
  if (!vitrine) return { title: "Loja não encontrada", robots: { index: false, follow: false } };

  const nome = vitrine.loja.nome ?? "Loja";
  const produto = typeof p === "string" ? vitrine.produtos.find((x) => x.id === p) : undefined;
  const base = await enderecoDoApp();
  const imagem = `/loja/${slug.toLowerCase()}/imagem${produto ? `?p=${produto.id}` : ""}`;
  const titulo = produto ? `${produto.nome} | ${nome}` : nome;
  const descricao = produto
    ? `${produto.esgotado ? "Esgotado no momento" : formatBRL(produto.preco)}. Peça pelo WhatsApp na ${nome}.`
    : (vitrine.loja.boas_vindas ?? `Veja os produtos da ${nome} e peça pelo WhatsApp.`);

  return {
    metadataBase: new URL(base),
    title: { absolute: titulo },
    description: descricao,
    openGraph: { title: titulo, description: descricao, images: [imagem], type: "website", locale: "pt_BR" },
    twitter: { card: "summary_large_image", title: titulo, description: descricao, images: [imagem] },
  };
}

// a barra do navegador acompanha o fundo da loja, não o tema do app
export async function generateViewport({ params }: PageProps<"/loja/[slug]">): Promise<Viewport> {
  const { slug } = await params;
  const vitrine = await carregar(slug);
  return { themeColor: vitrine?.loja.tema === "escuro" ? "#000000" : "#f2f2f7" };
}

export default async function LojaPage({ params }: PageProps<"/loja/[slug]">) {
  const { slug } = await params;
  const vitrine = await carregar(slug);
  if (!vitrine) notFound();
  return <Loja slug={slug.toLowerCase()} vitrine={vitrine} />;
}
