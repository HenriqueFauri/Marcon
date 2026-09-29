"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAction } from "@/components/use-action";
import { useToast } from "@/components/toaster";
import { mensagemDeErro } from "@/lib/action";
import { IconPlus, IconX } from "@/components/icons";
import { excluirFoto, registrarFoto } from "../actions";

interface FotoComUrl {
  id: string;
  path: string;
  url: string | null;
}

const TAMANHO_MAX = 8 * 1024 * 1024;

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

export function FotosSection({ produtoId, fotos }: { produtoId: string; fotos: FotoComUrl[] }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState<{ atual: number; total: number } | null>(null);
  const { isPending, run } = useAction();
  const toast = useToast();

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    const lista = Array.from(files);
    const grandes = lista.filter((f) => f.size > TAMANHO_MAX);
    if (grandes.length) toast.error(`${grandes.length} foto(s) acima de 8 MB foram ignoradas.`);
    const validas = lista.filter((f) => f.size <= TAMANHO_MAX);
    if (!validas.length) return;

    setEnviando({ atual: 0, total: validas.length });
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("não autenticado");

      for (const [i, file] of validas.entries()) {
        setEnviando({ atual: i + 1, total: validas.length });
        const path = `${user.id}/${produtoId}/${Date.now()}-${nomeSeguro(file.name)}`;
        const { error: uploadError } = await supabase.storage.from("produto-fotos").upload(path, file, {
          contentType: file.type || undefined,
        });
        if (uploadError) throw uploadError;
        const r = await registrarFoto(produtoId, path, fotos.length + i);
        if (!r.ok) throw new Error(r.error);
      }
      toast.success(validas.length > 1 ? `${validas.length} fotos adicionadas.` : "Foto adicionada.");
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
          <div key={foto.id} className="group relative aspect-square overflow-hidden rounded-lg border border-neutral-800 bg-neutral-800">
            {foto.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={foto.url} alt={`Foto ${i + 1} do produto`} className="h-full w-full object-cover" loading="lazy" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xs text-neutral-500">sem preview</div>
            )}
            {i === 0 && (
              <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white">Capa</span>
            )}
            <button
              type="button"
              disabled={isPending}
              onClick={() => run(() => excluirFoto(foto.id, foto.path, produtoId))}
              aria-label={`Remover foto ${i + 1}`}
              className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-md bg-black/70 text-white transition hover:bg-red-500 disabled:opacity-50 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
            >
              <IconX width={14} height={14} />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={!!enviando}
          className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-neutral-700 text-xs text-neutral-400 transition hover:border-emerald-500 hover:text-emerald-400 disabled:opacity-50"
        >
          <IconPlus />
          {enviando ? `${enviando.atual}/${enviando.total}...` : "Adicionar"}
        </button>
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
      {fotos.length === 0 && !enviando && (
        <p className="mt-3 text-xs text-neutral-500">A primeira foto vira a capa. Dá pra enviar várias de uma vez.</p>
      )}
    </div>
  );
}
