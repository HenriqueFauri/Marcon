import { ImageResponse } from "next/og";
import { NextResponse, type NextRequest } from "next/server";
import sharp from "sharp";
import { formatBRL } from "@/lib/format";
import { coresDaLoja, corDoTexto, type Vitrine } from "@/lib/vitrine";
import { buscarVitrine } from "@/lib/vitrine-servidor";
import { VITRINE_EXEMPLO } from "../exemplo";

// Imagem da prévia do link (WhatsApp, Instagram, Facebook), 1200x630 nas cores da loja:
// foto à esquerda e, à direita, logo, nome e o produto com preço (?p=id) ou a frase da loja.
// As fotos ficam em buckets privados com links que expiram, então a imagem é montada aqui.
// Se a foto não der para usar (formato que o gerador não lê), manda para a foto, como antes.

const LARGURA = 1200;
const ALTURA = 630;

async function carregar(slug: string) {
  if (slug === "exemplo" && process.env.NODE_ENV !== "production") return VITRINE_EXEMPLO;
  return buscarVitrine(slug);
}

// baixa a foto e devolve como data URL; só JPEG, PNG e SVG (o que o gerador lê)
async function comoDataUrl(url: string | null | undefined) {
  if (!url) return null;
  if (url.startsWith("data:image/svg") || url.startsWith("data:image/png") || url.startsWith("data:image/jpeg")) return url;
  try {
    const r = await fetch(url);
    const tipo = r.headers.get("content-type")?.split(";")[0] ?? "";
    if (!r.ok || !["image/jpeg", "image/png"].includes(tipo)) return null;
    return `data:${tipo};base64,${Buffer.from(await r.arrayBuffer()).toString("base64")}`;
  } catch {
    return null;
  }
}

function fotoDoLink(vitrine: Vitrine, produtoId: string | null) {
  const produto = produtoId ? vitrine.produtos.find((p) => p.id === produtoId) : undefined;
  const foto =
    produto?.fotos.find((f) => f.variacaoId === null)?.url ??
    produto?.fotos[0]?.url ??
    vitrine.banner?.urls[0] ??
    vitrine.produtos.find((p) => p.fotos.length > 0)?.fotos[0]?.url ??
    vitrine.loja.logoUrl;
  return { produto, foto };
}

export async function GET(request: NextRequest, { params }: RouteContext<"/loja/[slug]/imagem">) {
  const { slug } = await params;
  const vitrine = await carregar(slug);
  if (!vitrine) return new NextResponse(null, { status: 404 });

  const { produto, foto } = fotoDoLink(vitrine, request.nextUrl.searchParams.get("p"));
  const [fotoDados, logoDados] = await Promise.all([comoDataUrl(foto), comoDataUrl(vitrine.loja.logoUrl)]);
  if (foto && !fotoDados) return NextResponse.redirect(foto, { status: 302, headers: { "Cache-Control": "public, max-age=600" } });

  const cores = coresDaLoja(vitrine.loja);
  const nomeLoja = vitrine.loja.nome ?? "Loja";
  const preco = produto
    ? produto.esgotado
      ? "Esgotado no momento"
      : `${produto.tem_variacoes && produto.variacoes.length > 1 ? "a partir de " : ""}${formatBRL(
          Math.min(...(produto.tem_variacoes && produto.variacoes.length > 0 ? produto.variacoes.map((v) => Number(v.preco)) : [Number(produto.preco)])),
        )}`
    : null;
  const titulo = produto?.nome ?? nomeLoja;
  const frase = produto ? null : vitrine.loja.boas_vindas;

  const png = new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%", background: cores.fundo, color: cores.texto }}>
        {fotoDados ? (
          // eslint-disable-next-line @next/next/no-img-element -- o gerador de imagem só aceita <img>
          <img src={fotoDados} alt="" width={ALTURA} height={ALTURA} style={{ objectFit: "cover" }} />
        ) : (
          <div style={{ display: "flex", width: ALTURA, height: ALTURA, background: cores.destaque }} />
        )}
        <div style={{ display: "flex", flex: 1, flexDirection: "column", justifyContent: "space-between", padding: 56 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            {logoDados ? (
              // eslint-disable-next-line @next/next/no-img-element -- o gerador de imagem só aceita <img>
              <img src={logoDados} alt="" width={64} height={64} style={{ borderRadius: 18, objectFit: "cover" }} />
            ) : (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 64,
                  height: 64,
                  borderRadius: 18,
                  background: cores.destaque,
                  color: corDoTexto(cores.destaque),
                  fontSize: 32,
                  fontWeight: 700,
                }}
              >
                {nomeLoja.trim().charAt(0).toUpperCase()}
              </div>
            )}
            <div style={{ display: "flex", fontSize: 30, fontWeight: 600, opacity: 0.85 }}>{produto ? nomeLoja : ""}</div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{ display: "flex", fontSize: titulo.length > 40 ? 46 : 56, fontWeight: 700, lineHeight: 1.1, letterSpacing: -1 }}>
              {titulo.length > 90 ? `${titulo.slice(0, 88)}…` : titulo}
            </div>
            {preco && <div style={{ display: "flex", fontSize: 48, fontWeight: 700, color: cores.destaque }}>{preco}</div>}
            {frase && <div style={{ display: "flex", fontSize: 30, lineHeight: 1.3, opacity: 0.75 }}>{frase}</div>}
          </div>

          <div
            style={{
              display: "flex",
              alignSelf: "flex-start",
              padding: "16px 30px",
              borderRadius: 999,
              background: cores.botao,
              color: corDoTexto(cores.botao),
              fontSize: 28,
              fontWeight: 600,
            }}
          >
            Peça pelo WhatsApp
          </div>
        </div>
      </div>
    ),
    { width: LARGURA, height: ALTURA },
  );

  // o gerador só faz PNG, pesado com foto; o WhatsApp ignora prévia pesada, então vai em JPEG
  const jpeg = await sharp(Buffer.from(await png.arrayBuffer())).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
  return new NextResponse(new Uint8Array(jpeg), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=600" },
  });
}
