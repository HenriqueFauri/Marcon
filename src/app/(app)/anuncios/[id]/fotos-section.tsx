"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useAction } from "@/components/use-action";
import { useToast } from "@/components/toaster";
import { Card, btnSecondary } from "@/components/ui";
import { mensagemDeErro } from "@/lib/action";
import { IconPlus, IconX } from "@/components/icons";
import { comprimirImagem, MAX_FOTOS_POR_ITEM, TAMANHO_ENVIO_MAX, TAMANHO_ORIGINAL_MAX } from "@/lib/imagem";
import { excluirFoto, registrarFoto, reordenarFotos } from "../../produtos/actions";
import { baixarBlob, buscarImagem, copiarImagemParaAreaDeTransferencia, nomeArquivo } from "./fotos-utils";

export interface FotoComUrl {
  id: string;
  path: string;
  variacao_id: string | null;
  url: string | null;
}

const FORMATOS_ACEITOS = ["image/jpeg", "image/png", "image/webp"];

// nomes com espaço/acento quebram a chave no storage
function nomeSeguro(nome: string) {
  const [base, ...resto] = nome.split(".").reverse();
  const ext = resto.length ? base.toLowerCase() : "jpg";
  const semExt = resto.length ? resto.reverse().join(".") : base;
  const limpo = semExt
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .slice(0, 40);
  return `${limpo || "foto"}.${ext}`;
}

// As fotos do produto vivem aqui, no anúncio: enviar, remover, copiar e baixar.
// Produto com variações: um bloco de fotos gerais (vale para todas) e um por variação.
// O limite de fotos do plano conta por bloco, igual ao banco.
export function FotosSection({
  produtoId,
  nomeProduto,
  fotos,
  variacoes = [],
  maxFotos = MAX_FOTOS_POR_ITEM,
}: {
  produtoId: string;
  nomeProduto: string;
  fotos: FotoComUrl[];
  variacoes?: { id: string; nome_combinacao: string }[];
  maxFotos?: number;
}) {
  const toast = useToast();
  const [ocupado, setOcupado] = useState(false);
  const comUrl = fotos.filter((f): f is FotoComUrl & { url: string } => !!f.url);

  // no celular abre o compartilhamento (Facebook, WhatsApp...); no desktop baixa os arquivos
  async function levarTodas() {
    setOcupado(true);
    try {
      const arquivos = await Promise.all(
        comUrl.map(async (f, i) => {
          const blob = await buscarImagem(f.url);
          return new File([blob], nomeArquivo(nomeProduto, i, blob.type), { type: blob.type });
        }),
      );
      if (navigator.canShare?.({ files: arquivos })) {
        await navigator.share({ files: arquivos });
        return;
      }
      for (const arquivo of arquivos) {
        baixarBlob(arquivo, arquivo.name);
        await new Promise((r) => setTimeout(r, 250));
      }
      toast.success(`${arquivos.length} foto(s) baixada(s).`);
    } catch (e) {
      if ((e as Error).name !== "AbortError") toast.error("Não foi possível preparar as fotos.");
    } finally {
      setOcupado(false);
    }
  }

  const grupo = (variacaoId: string | null) => (
    <GrupoFotos
      produtoId={produtoId}
      nomeProduto={nomeProduto}
      variacaoId={variacaoId}
      fotos={fotos.filter((f) => f.variacao_id === variacaoId)}
      maxFotos={maxFotos}
    />
  );

  return (
    <Card
      title="Fotos"
      description="A primeira é a capa. Envie aqui, copie e cole direto no anúncio ou baixe."
      action={
        comUrl.length > 1 ? (
          <button type="button" onClick={levarTodas} disabled={ocupado} className={`${btnSecondary} px-4 py-1.5 text-sm`}>
            {ocupado ? "Preparando..." : "Baixar todas"}
          </button>
        ) : undefined
      }
    >
      {variacoes.length === 0 ? (
        grupo(null)
      ) : (
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-1 text-sm font-semibold text-ink">Fotos gerais</h3>
            <p className="mb-3 text-xs text-ink-muted">Aparecem em qualquer variação que não tenha foto própria.</p>
            {grupo(null)}
          </div>
          {variacoes.map((v) => (
            <div key={v.id}>
              <h3 className="mb-3 text-sm font-semibold text-ink">{v.nome_combinacao}</h3>
              {grupo(v.id)}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// maxFotos vem do plano (3 no grátis, 10 no pago); o banco impõe o mesmo limite.
// Arrastar uma foto muda a ordem (a primeira é a capa): no mouse, é só arrastar; no toque,
// segurar um instante e arrastar (para não brigar com a rolagem da tela). Soltar arquivos
// de imagem em cima do bloco envia as fotos.
function GrupoFotos({
  produtoId,
  nomeProduto,
  variacaoId,
  fotos,
  maxFotos,
}: {
  produtoId: string;
  nomeProduto: string;
  variacaoId: string | null;
  fotos: FotoComUrl[];
  maxFotos: number;
}) {
  const limitadoPeloPlano = maxFotos < MAX_FOTOS_POR_ITEM;
  const inputRef = useRef<HTMLInputElement>(null);
  const gradeRef = useRef<HTMLDivElement>(null);
  const [enviando, setEnviando] = useState<{ atual: number; total: number } | null>(null);
  const [soltando, setSoltando] = useState(false);
  const { isPending, run } = useAction();
  const toast = useToast();

  // ordem na tela: muda na hora ao arrastar e volta a seguir o servidor quando ele responde
  const [ordem, setOrdem] = useState(fotos);
  const assinatura = fotos.map((f) => f.id).join(",");
  const [assinaturaVista, setAssinaturaVista] = useState(assinatura);
  if (assinatura !== assinaturaVista) {
    setAssinaturaVista(assinatura);
    setOrdem(fotos);
  }
  const ordemRef = useRef(ordem);
  useEffect(() => {
    ordemRef.current = ordem;
  }, [ordem]);

  const [arrastando, setArrastando] = useState<string | null>(null);
  const gesto = useRef<{
    id: string;
    x: number;
    y: number;
    ativo: boolean;
    pointerId: number;
    el: HTMLElement;
    timer: ReturnType<typeof setTimeout> | null;
  } | null>(null);

  // no toque, a tela não rola enquanto uma foto está sendo arrastada
  useEffect(() => {
    const el = gradeRef.current;
    if (!el) return;
    const bloquear = (e: TouchEvent) => {
      if (gesto.current?.ativo) e.preventDefault();
    };
    el.addEventListener("touchmove", bloquear, { passive: false });
    return () => el.removeEventListener("touchmove", bloquear);
  }, []);

  function ativarArraste() {
    const g = gesto.current;
    if (!g) return;
    g.ativo = true;
    try {
      g.el.setPointerCapture(g.pointerId);
    } catch {}
    setArrastando(g.id);
    navigator.vibrate?.(10);
  }

  function iniciarArraste(e: React.PointerEvent<HTMLElement>, id: string) {
    if (e.button !== 0 || isPending || enviando || ordem.length < 2) return;
    if ((e.target as HTMLElement).closest("button")) return; // o botão de remover continua sendo clique
    const g = { id, x: e.clientX, y: e.clientY, ativo: false, pointerId: e.pointerId, el: e.currentTarget, timer: null as ReturnType<typeof setTimeout> | null };
    if (e.pointerType !== "mouse") g.timer = setTimeout(ativarArraste, 280);
    gesto.current = g;
  }

  function moverArraste(e: React.PointerEvent<HTMLElement>) {
    const g = gesto.current;
    if (!g) return;
    if (!g.ativo) {
      const distancia = Math.hypot(e.clientX - g.x, e.clientY - g.y);
      if (e.pointerType === "mouse") {
        if (distancia > 6) ativarArraste();
        else return;
      } else {
        // mexeu antes do toque longo: é rolagem, não arraste
        if (distancia > 10) {
          if (g.timer) clearTimeout(g.timer);
          gesto.current = null;
        }
        return;
      }
    }
    const alvoId = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-foto-id]")?.dataset.fotoId;
    if (!alvoId || alvoId === g.id) return;
    setOrdem((atual) => {
      const de = atual.findIndex((f) => f.id === g.id);
      const para = atual.findIndex((f) => f.id === alvoId);
      if (de < 0 || para < 0) return atual;
      const nova = [...atual];
      const [item] = nova.splice(de, 1);
      nova.splice(para, 0, item);
      return nova;
    });
  }

  function terminarArraste() {
    const g = gesto.current;
    gesto.current = null;
    if (!g) return;
    if (g.timer) clearTimeout(g.timer);
    if (!g.ativo) return;
    setArrastando(null);
    const ids = ordemRef.current.map((f) => f.id);
    if (ids.join(",") === assinatura) return;
    const novaCapa = ids[0] !== fotos[0]?.id;
    run(() => reordenarFotos(produtoId, ids), {
      success: novaCapa ? "Capa atualizada." : "Ordem salva.",
      onError: () => setOrdem(fotos),
    });
  }

  async function copiarImagem(url: string) {
    try {
      await copiarImagemParaAreaDeTransferencia(url);
      toast.success("Foto copiada. É só colar no anúncio.");
    } catch {
      toast.error("Seu navegador não copiou a imagem. Use o botão Baixar.");
    }
  }

  async function baixarUma(url: string, i: number) {
    try {
      const blob = await buscarImagem(url);
      baixarBlob(blob, nomeArquivo(nomeProduto, i, blob.type));
    } catch {
      toast.error("Não foi possível baixar a foto.");
    }
  }

  async function handleUpload(files: FileList | File[] | null) {
    if (!files || files.length === 0) return;
    const vagas = maxFotos - fotos.length;
    if (vagas <= 0) {
      toast.error(
        limitadoPeloPlano
          ? `No plano grátis cada produto tem até ${maxFotos} fotos. Assine o plano Marcon para ter até ${MAX_FOTOS_POR_ITEM}.`
          : `Este produto já tem ${maxFotos} fotos. Remova uma para adicionar outra.`,
      );
      return;
    }
    let lista = Array.from(files);
    if (lista.length > vagas) {
      toast.error(`Só cabem mais ${vagas} foto(s). ${lista.length - vagas} ficou de fora.`);
      lista = lista.slice(0, vagas);
    }
    const grandes = lista.filter((f) => f.size > TAMANHO_ORIGINAL_MAX);
    if (grandes.length) toast.error(`${grandes.length} foto(s) acima de 30 MB foram ignoradas.`);
    const validas = lista.filter((f) => f.size <= TAMANHO_ORIGINAL_MAX);
    if (!validas.length) return;

    setEnviando({ atual: 0, total: validas.length });
    let enviadas = 0;
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("não autenticado");

      for (const [i, original] of validas.entries()) {
        setEnviando({ atual: i + 1, total: validas.length });
        // reduz no navegador antes de enviar: menos espaço e envio mais rápido no celular
        const arquivo = await comprimirImagem(original);
        if (!FORMATOS_ACEITOS.includes(arquivo.type)) {
          toast.error(`"${original.name}" está num formato que não dá para enviar. Use JPEG, PNG ou WebP.`);
          continue;
        }
        if (arquivo.size > TAMANHO_ENVIO_MAX) {
          toast.error(`"${original.name}" continua grande demais mesmo reduzida. Tente outra foto.`);
          continue;
        }
        const path = `${user.id}/${produtoId}/${Date.now()}-${nomeSeguro(arquivo.name)}`;
        const { error: uploadError } = await supabase.storage.from("produto-fotos").upload(path, arquivo, {
          contentType: arquivo.type,
        });
        if (uploadError) throw uploadError;
        const r = await registrarFoto(produtoId, path, fotos.length + enviadas, variacaoId);
        if (!r.ok) {
          // não deixa o arquivo órfão no armazenamento (ex.: o banco recusou por limite)
          await supabase.storage.from("produto-fotos").remove([path]);
          throw new Error(r.error);
        }
        enviadas += 1;
      }
      if (enviadas > 0) toast.success(enviadas > 1 ? `${enviadas} fotos adicionadas.` : "Foto adicionada.");
    } catch (e) {
      toast.error(mensagemDeErro(e, "Erro ao enviar a foto."));
    } finally {
      setEnviando(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const cabe = fotos.length < maxFotos;

  return (
    <div
      onDragOver={(e) => {
        if (!cabe || enviando || !e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        setSoltando(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setSoltando(false);
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setSoltando(false);
        const imagens = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
        if (imagens.length === 0) {
          toast.error("Solte arquivos de imagem (JPEG, PNG ou WebP).");
          return;
        }
        void handleUpload(imagens);
      }}
      className={`relative -m-2 rounded-3xl p-2 transition ${soltando ? "bg-brand-tint ring-2 ring-brand ring-offset-2 ring-offset-surface" : ""}`}
    >
      {soltando && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-3xl">
          <span className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-on-brand shadow-lg">Solte para enviar</span>
        </div>
      )}
      <div ref={gradeRef} className="grid grid-cols-3 gap-3 sm:grid-cols-5">
        {ordem.map((foto, i) => {
          const esta = arrastando === foto.id;
          return (
            <div key={foto.id} className="flex flex-col gap-1.5">
              <div
                data-foto-id={foto.id}
                onPointerDown={(e) => iniciarArraste(e, foto.id)}
                onPointerMove={moverArraste}
                onPointerUp={terminarArraste}
                onPointerCancel={terminarArraste}
                onContextMenu={(e) => {
                  if (gesto.current) e.preventDefault(); // segurar no celular não abre o menu da imagem
                }}
                className={`group relative aspect-square select-none overflow-hidden rounded-2xl border bg-fill transition [-webkit-touch-callout:none] ${
                  ordem.length > 1 ? "cursor-grab active:cursor-grabbing" : ""
                } ${esta ? "z-10 scale-105 border-brand opacity-80 shadow-xl ring-2 ring-brand" : "border-line"}`}
              >
                {foto.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={foto.url}
                    alt={`Foto ${i + 1} do produto`}
                    draggable={false}
                    className="pointer-events-none absolute inset-0 h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs text-ink-muted">sem preview</div>
                )}
                {i === 0 && (
                  <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white">Capa</span>
                )}
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => run(() => excluirFoto(foto.id, foto.path, produtoId))}
                  aria-label={`Remover foto ${i + 1}`}
                  className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-md bg-black/70 text-white transition hover:bg-danger disabled:opacity-50 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
                >
                  <IconX width={14} height={14} />
                </button>
              </div>
              {foto.url && (
                <div className="flex items-center justify-center gap-3 text-[13px] font-medium text-brand-text">
                  <button type="button" onClick={() => copiarImagem(foto.url!)} className="hover:underline">
                    Copiar
                  </button>
                  <button type="button" onClick={() => baixarUma(foto.url!, i)} className="hover:underline">
                    Baixar
                  </button>
                </div>
              )}
            </div>
          );
        })}
        {cabe && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={!!enviando}
            className="flex aspect-square flex-col items-center justify-center gap-1 self-start rounded-2xl border border-dashed border-line-strong px-2 text-center text-xs text-ink-muted transition hover:border-brand hover:text-brand-text disabled:opacity-50"
          >
            <IconPlus />
            {enviando ? (
              `${enviando.atual}/${enviando.total}...`
            ) : (
              <>
                Adicionar
                <span className="hidden text-[11px] text-ink-faint sm:block">ou arraste aqui</span>
              </>
            )}
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => handleUpload(e.target.files)}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      />
      <p className="mt-3 text-xs text-ink-muted">
        {fotos.length === 0
          ? "A primeira foto vira a capa. Dá pra enviar várias de uma vez, ou arrastar os arquivos pra cá; o Marcon reduz o tamanho sozinho."
          : `${fotos.length} de ${maxFotos} ${maxFotos === 1 ? "foto" : "fotos"}.`}
        {fotos.length > 1 && " Arraste as fotos para mudar a ordem (no celular, segure e arraste). A primeira é a capa."}
        {limitadoPeloPlano && fotos.length >= maxFotos && (
          <>
            {" "}
            No plano grátis cada produto tem até {maxFotos} fotos.{" "}
            <Link href="/assinatura" className="font-medium text-brand-text underline-offset-2 hover:underline">
              Assine o Marcon
            </Link>{" "}
            para ter até {MAX_FOTOS_POR_ITEM}.
          </>
        )}
      </p>
    </div>
  );
}
