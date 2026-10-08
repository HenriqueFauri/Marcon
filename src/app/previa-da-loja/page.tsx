import type { Metadata } from "next";
import { buscarPrevia } from "@/lib/vitrine-servidor";
import { Loja } from "../loja/[slug]/loja";

// Loja do dono logado dentro do iframe de Personalizar (só o próprio app pode emoldurar: next.config.ts).
// Os textos e as cores ainda não salvos chegam do formulário por postMessage.
export const metadata: Metadata = { title: "Prévia da loja", robots: { index: false, follow: false } };

export default async function PreviaDaLojaPage() {
  const vitrine = await buscarPrevia();
  if (!vitrine) {
    return <p className="p-6 text-center text-[15px] text-ink-muted">Crie sua loja em Configurações para ver a prévia.</p>;
  }
  return <Loja slug="previa" vitrine={vitrine} previa />;
}
