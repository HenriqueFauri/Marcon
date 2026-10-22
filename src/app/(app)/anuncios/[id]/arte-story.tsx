"use client";

import { useEffect, useRef, useState } from "react";
import { formatBRL } from "@/lib/format";
import { corDoTexto, type CoresDaLoja } from "@/lib/vitrine";
import { useToast } from "@/components/toaster";
import { btnPrimary, btnSecondary } from "@/components/ui";
import { Grupo } from "@/components/ajustes";

// F25: arte 9:16 (status do WhatsApp, stories) desenhada no navegador, sem dependência nem custo de servidor.
const L = 1080;
const A = 1920;
const FONTE = '"Geist", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';

function carregar(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("foto"));
    img.src = url;
  });
}

function retanguloArredondado(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
}

// quebra o texto em até "max" linhas, com reticências se passar
function quebrar(c: CanvasRenderingContext2D, texto: string, largura: number, max: number) {
  const linhas: string[] = [];
  let atual = "";
  const palavras = texto.split(/\s+/).filter(Boolean);
  for (let i = 0; i < palavras.length; i++) {
    const teste = atual ? `${atual} ${palavras[i]}` : palavras[i];
    if (c.measureText(teste).width <= largura || !atual) {
      atual = teste;
      continue;
    }
    linhas.push(atual);
    atual = palavras[i];
    if (linhas.length === max) break;
  }
  if (atual && linhas.length < max) linhas.push(atual);
  const consumido = linhas.join(" ").split(/\s+/).length;
  if (consumido < palavras.length) {
    let ultima = linhas[linhas.length - 1];
    while (ultima.length > 1 && c.measureText(`${ultima}…`).width > largura) ultima = ultima.slice(0, -1);
    linhas[linhas.length - 1] = `${ultima.trimEnd()}…`;
  }
  return linhas;
}

async function desenhar(canvas: HTMLCanvasElement, d: { foto: string | null; nome: string; preco: number; loja: string; cores: CoresDaLoja }) {
  const c = canvas.getContext("2d");
  if (!c) return;
  try {
    await document.fonts.ready;
  } catch {}
  const { cores } = d;
  c.clearRect(0, 0, L, A);
  c.fillStyle = cores.fundo;
  c.fillRect(0, 0, L, A);

  // foto: quadrada com cantos arredondados, cortada para preencher
  const m = 80;
  const lado = L - m * 2;
  const topo = 190;
  c.save();
  retanguloArredondado(c, m, topo, lado, lado, 56);
  c.clip();
  c.fillStyle = cores.texto + "14";
  c.fillRect(m, topo, lado, lado);
  if (d.foto) {
    try {
      const img = await carregar(d.foto);
      const esc = Math.max(lado / img.width, lado / img.height);
      const w = img.width * esc;
      const h = img.height * esc;
      c.drawImage(img, m + (lado - w) / 2, topo + (lado - h) / 2, w, h);
    } catch {}
  }
  c.restore();

  c.textBaseline = "alphabetic";
  c.textAlign = "center";

  // nome da loja no alto
  c.fillStyle = cores.texto;
  c.font = `600 44px ${FONTE}`;
  const loja = quebrar(c, d.loja.toUpperCase(), lado, 1)[0] ?? "";
  c.fillText(loja, L / 2, 120);

  // nome do produto
  c.fillStyle = cores.texto;
  c.font = `700 72px ${FONTE}`;
  const linhas = quebrar(c, d.nome, lado, 3);
  let y = topo + lado + 130;
  for (const l of linhas) {
    c.fillText(l, L / 2, y);
    y += 88;
  }

  // preço em pílula na cor do botão
  const preco = formatBRL(d.preco);
  c.font = `800 110px ${FONTE}`;
  const w = Math.min(lado, c.measureText(preco).width + 140);
  const h = 170;
  const py = Math.min(y + 30, A - 190 - h);
  c.fillStyle = cores.botao;
  retanguloArredondado(c, (L - w) / 2, py, w, h, h / 2);
  c.fill();
  c.fillStyle = corDoTexto(cores.botao);
  c.fillText(preco, L / 2, py + 122);
}

export function ArteStory({
  fotos,
  nome,
  preco,
  loja,
  cores,
}: {
  fotos: { id: string; url: string | null }[];
  nome: string;
  preco: number;
  loja: string;
  cores: CoresDaLoja;
}) {
  const toast = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const comUrl = fotos.filter((f) => f.url);
  const [fotoId, setFotoId] = useState(comUrl[0]?.id ?? "");
  const [pronta, setPronta] = useState(false);
  const foto = comUrl.find((f) => f.id === fotoId)?.url ?? null;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelado = false;
    setPronta(false);
    desenhar(canvas, { foto, nome, preco, loja, cores }).then(() => {
      if (!cancelado) setPronta(true);
    });
    return () => {
      cancelado = true;
    };
  }, [foto, nome, preco, loja, cores]);

  function blob() {
    return new Promise<Blob | null>((resolve) => canvasRef.current?.toBlob(resolve, "image/png") ?? resolve(null));
  }

  const nomeArquivo = `${nome.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "produto"}-story.png`;

  async function baixar() {
    const b = await blob();
    if (!b) return toast.error("Não foi possível gerar a imagem. Se a foto não carregar, tente outra.");
    const url = URL.createObjectURL(b);
    const a = document.createElement("a");
    a.href = url;
    a.download = nomeArquivo;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function compartilhar() {
    const b = await blob();
    if (!b) return toast.error("Não foi possível gerar a imagem. Se a foto não carregar, tente outra.");
    const arquivo = new File([b], nomeArquivo, { type: "image/png" });
    if (navigator.canShare?.({ files: [arquivo] })) {
      try {
        await navigator.share({ files: [arquivo], title: nome });
      } catch {}
      return;
    }
    await baixar();
  }

  return (
    <Grupo titulo="Arte para status e stories" rodape="Imagem 9:16 com a foto, o preço e o nome da loja, nas cores da sua vitrine." >
      <div className="mx-auto w-full max-w-[260px]">
        <canvas
          ref={canvasRef}
          width={L}
          height={A}
          aria-label={`Arte de ${nome} para status e stories`}
          className="hairline aspect-[9/16] w-full rounded-2xl"
        />
      </div>
      {comUrl.length > 1 && (
        <div className="flex flex-wrap justify-center gap-2" role="group" aria-label="Foto da arte">
          {comUrl.map((f, i) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={f.id === fotoId}
              aria-label={`Foto ${i + 1}`}
              onClick={() => setFotoId(f.id)}
              className={`h-14 w-14 shrink-0 overflow-hidden rounded-xl ${f.id === fotoId ? "ring-2 ring-brand-fill" : "opacity-70"}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.url!} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
      {comUrl.length === 0 && <p className="text-center text-[13px] text-ink-muted">Sem foto, a arte sai só com nome e preço. Adicione uma foto acima.</p>}
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
        <button type="button" onClick={baixar} disabled={!pronta} className={`${btnPrimary} w-full sm:w-auto`}>
          Baixar imagem
        </button>
        <button type="button" onClick={compartilhar} disabled={!pronta} className={`${btnSecondary} w-full sm:w-auto`}>
          Compartilhar
        </button>
      </div>
    </Grupo>
  );
}
