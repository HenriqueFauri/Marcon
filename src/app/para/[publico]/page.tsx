import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Landing, metadataDo, type Publico } from "@/app/landing/landing";

// Links para mandar em cada grupo: /para/marketplace e /para/whatsapp.
const CANAIS = ["marketplace", "whatsapp"] as const satisfies readonly Publico[];

function ehCanal(valor: string): valor is (typeof CANAIS)[number] {
  return (CANAIS as readonly string[]).includes(valor);
}

export function generateStaticParams() {
  return CANAIS.map((publico) => ({ publico }));
}

export async function generateMetadata({ params }: PageProps<"/para/[publico]">): Promise<Metadata> {
  const { publico } = await params;
  return ehCanal(publico) ? metadataDo(publico) : {};
}

export default async function LandingDoCanal({ params }: PageProps<"/para/[publico]">) {
  const { publico } = await params;
  if (!ehCanal(publico)) notFound();
  return <Landing publico={publico} />;
}
