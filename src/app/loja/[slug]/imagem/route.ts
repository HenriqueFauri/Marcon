import { NextResponse, type NextRequest } from "next/server";
import { buscarVitrine } from "@/lib/vitrine-servidor";

// Imagem da prévia do link (WhatsApp, Instagram, Facebook). As fotos ficam em buckets privados
// e os links assinados expiram; este endereço é fixo e manda para um link assinado novo.
// ?p=id usa a primeira foto do produto; sem ele, o banner, depois o logo.
export async function GET(request: NextRequest, { params }: RouteContext<"/loja/[slug]/imagem">) {
  const { slug } = await params;
  const vitrine = await buscarVitrine(slug);
  if (!vitrine) return new NextResponse(null, { status: 404 });

  const produtoId = request.nextUrl.searchParams.get("p");
  const produto = produtoId ? vitrine.produtos.find((p) => p.id === produtoId) : undefined;
  const url =
    produto?.fotos.find((f) => f.variacaoId === null)?.url ??
    produto?.fotos[0]?.url ??
    vitrine.banner?.urls[0] ??
    vitrine.loja.logoUrl ??
    vitrine.produtos.find((p) => p.fotos.length > 0)?.fotos[0]?.url;
  if (!url) return new NextResponse(null, { status: 404 });

  return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "public, max-age=600" } });
}
