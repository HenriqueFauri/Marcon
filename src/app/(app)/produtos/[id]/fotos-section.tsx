"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useAction } from "@/components/use-action";
import { useToast } from "@/components/toaster";
import { mensagemDeErro } from "@/lib/action";
import { IconPlus, IconX } from "@/components/icons";
import { comprimirImagem, MAX_FOTOS_POR_ITEM, TAMANHO_ENVIO_MAX, TAMANHO_ORIGINAL_MAX } from "@/lib/imagem";
import { excluirFoto, registrarFoto } from "../actions";

interface FotoComUrl {
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

// Produto com variações: um bloco de fotos gerais (vale para todas) e um por variação.
// O limite de fotos do plano conta por bloco, igual ao banco.
export function FotosSection({
  produtoId,
  fotos,
  variacoes = [],
  maxFotos = MAX_FOTOS_POR_ITEM,
}: {
  produtoId: string;
  fotos: FotoComUrl[];
  variacoes?: { id: string; nome_combinacao: string }[];
  maxFotos?: number;
}) {
  if (variacoes.length === 0) {
    return <GrupoFotos produtoId={produtoId} variacaoId={null} fotos={fotos} maxFotos={maxFotos} />;
  }
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h3 className="mb-1 text-sm font-semibold text-ink">Fotos gerais</h3>
        <p className="mb-3 text-xs text-ink-muted">Aparecem em qualquer variação que não tenha foto própria.</p>
        <GrupoFotos
          produtoId={produtoId}
          variacaoId={null}
          fotos={fotos.filter((f) => f.variacao_id === null)}
          maxFotos={maxFotos}
        />
      </div>
      {variacoes.map((v) => (
        <div key={v.id}>
          <h3 className="mb-3 text-sm font-semibold text-ink">{v.nome_combinacao}</h3>
          <GrupoFotos
            produtoId={produtoId}
            variacaoId={v.id}
            fotos={fotos.filter((f) => f.variacao_id === v.id)}
            maxFotos={maxFotos}
          />
        </div>
      ))}
    </div>
  );
}

// maxFotos vem do plano (3 no grátis, 10 no pago); o banco impõe o mesmo limite
function GrupoFotos({
  produtoId,
  variacaoId,
  fotos,
  maxFotos,
}: {
  produtoId: string;
  variacaoId: string | null;
  fotos: FotoComUrl[];
  maxFotos: number;
}) {
  const limitadoPeloPlano = maxFotos < MAX_FOTOS_POR_ITEM;
  const inputRef = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState<{ atual: number; total: number } | null>(null);
  const { isPending, run } = useAction();
  const toast = useToast();

  async function handleUpload(files: FileList | null) {
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

  return (
    <div>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
        {fotos.map((foto, i) => (
          <div key={foto.id} className="group relative aspect-square overflow-hidden rounded-2xl border border-line bg-fill">
            {foto.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={foto.url} alt={`Foto ${i + 1} do produto`} className="h-full w-full object-cover" loading="lazy" />
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
        ))}
        {fotos.length < maxFotos && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={!!enviando}
            className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-line-strong text-xs text-ink-muted transition hover:border-brand hover:text-brand-text disabled:opacity-50"
          >
            <IconPlus />
            {enviando ? `${enviando.atual}/${enviando.total}...` : "Adicionar"}
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
          ? "A primeira foto vira a capa. Dá pra enviar várias de uma vez; o Marcon reduz o tamanho sozinho."
          : `${fotos.length} de ${maxFotos} ${maxFotos === 1 ? "foto" : "fotos"}.`}
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
