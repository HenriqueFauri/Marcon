"use client";

import { useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { excluirFoto, registrarFoto } from "../actions";

interface FotoComUrl {
  id: string;
  path: string;
  url: string | null;
}

export function FotosSection({ produtoId, fotos }: { produtoId: string; fotos: FotoComUrl[] }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    setIsUploading(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("não autenticado");

      for (const file of Array.from(files)) {
        const path = `${user.id}/${produtoId}/${Date.now()}-${file.name}`;
        const { error: uploadError } = await supabase.storage.from("produto-fotos").upload(path, file);
        if (uploadError) throw uploadError;
        await registrarFoto(produtoId, path);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "erro ao enviar foto");
    } finally {
      setIsUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div>
      {fotos.length > 0 && (
        <div className="mb-4 grid grid-cols-3 gap-3 sm:grid-cols-5">
          {fotos.map((foto) => (
            <div key={foto.id} className="group relative aspect-square overflow-hidden rounded-lg border border-neutral-800">
              {foto.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={foto.url} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-neutral-800 text-xs text-neutral-500">
                  sem preview
                </div>
              )}
              <button
                disabled={isPending}
                onClick={() => startTransition(() => excluirFoto(foto.id, foto.path, produtoId))}
                className="absolute right-1 top-1 rounded-md bg-black/70 px-1.5 py-0.5 text-xs text-white opacity-0 transition group-hover:opacity-100 hover:bg-red-500/80 disabled:opacity-50"
              >
                Excluir
              </button>
            </div>
          ))}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => handleUpload(e.target.files)}
        disabled={isUploading}
        className="text-sm text-neutral-300 file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-500 file:px-3 file:py-2 file:text-sm file:font-medium file:text-neutral-950 hover:file:bg-emerald-400"
      />
      {isUploading && <p className="mt-2 text-xs text-neutral-500">Enviando...</p>}
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  );
}
