import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { buscarVitrine } from "@/lib/vitrine-servidor";
import { Loja } from "./loja";

// Vitrine pública de um vendedor: abre sem login. Os dados vêm da função vitrine_publica
// (migration 0025), que devolve só o que o cliente deve ver: sem custo nem estoque exato.

export async function generateMetadata({ params }: PageProps<"/loja/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const vitrine = await buscarVitrine(slug);
  if (!vitrine) return { title: "Loja não encontrada", robots: { index: false, follow: false } };
  const nome = vitrine.loja.nome ?? "Loja";
  return {
    title: { absolute: nome },
    description: vitrine.loja.boas_vindas ?? `Veja os produtos de ${nome} e peça pelo WhatsApp.`,
  };
}

export default async function LojaPage({ params }: PageProps<"/loja/[slug]">) {
  const { slug } = await params;
  const vitrine = await buscarVitrine(slug);
  if (!vitrine) notFound();
  return <Loja slug={slug.toLowerCase()} vitrine={vitrine} />;
}
