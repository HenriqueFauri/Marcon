"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { mensagemDeErro } from "@/lib/action";
import { useAction } from "@/components/use-action";
import { useToast } from "@/components/toaster";
import { TAMANHO_ENVIO_MAX, TAMANHO_ORIGINAL_MAX, comprimirImagem } from "@/lib/imagem";
import { BANNER_MAX_IMAGENS } from "@/lib/vitrine";
import { IconPlus, IconX } from "@/components/icons";
import { adicionarImagemBanner, removerImagemBanner } from "./actions";

// Imagens do banner: sobem direto do navegador para o bucket vitrine-banner (como o logo) e a
// ação só guarda a lista. Precisa da vitrine já salva, porque a lista fica nela.
export function BannerImagens({
  imagens,
  habilitado,
}: {
  imagens: { path: string; url: string }[];
  habilitado: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { isPending, run } = useAction();
  const toast = useToast();
  const [enviando, setEnviando] = useState(false);
  const cheio = imagens.length >= BANNER_MAX_IMAGENS;

  async function enviar(files: FileList | null) {
    const original = files?.[0];
    if (!original) return;
    if (original.size > TAMANHO_ORIGINAL_MAX) {
      toast.error("A imagem é grande demais. Use uma de até 30 MB.");
      return;
    }
    setEnviando(true);
    try {
      const arquivo = await comprimirImagem(original);
      if (arquivo.size > TAMANHO_ENVIO_MAX) {
        toast.error("A imagem continua acima de 4 MB. Use uma menor.");
        return;
      }
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("não autenticado");

      const ext = (arquivo.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      const path = `${user.id}/banner-${Date.now()}.${ext}`;
      const { error: erroUpload } = await supabase.storage
        .from("vitrine-banner")
        .upload(path, arquivo, { contentType: arquivo.type || undefined });
      if (erroUpload) throw erroUpload;

      const r = await adicionarImagemBanner(path);
      if (!r.ok) throw new Error(r.error);
      toast.success(r.message ?? "Imagem adicionada.");
    } catch (e) {
      toast.error(mensagemDeErro(e, "Erro ao enviar a imagem."));
    } finally {
      setEnviando(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div>
      <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {imagens.map((img, i) => (
          <li key={img.path} className="group relative overflow-hidden rounded-2xl border border-line bg-fill">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img.url} alt={`Imagem ${i + 1} do banner`} className="aspect-[5/2] w-full object-cover" />
            <button
              type="button"
              disabled={isPending}
              onClick={() => run(() => removerImagemBanner(img.path))}
              aria-label={`Remover imagem ${i + 1} do banner`}
              className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur transition hover:bg-danger disabled:opacity-50"
            >
              <IconX width={14} height={14} />
            </button>
          </li>
        ))}
        {!cheio && (
          <li>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={!habilitado || enviando}
              className="flex aspect-[5/2] w-full flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-line-strong text-[13px] text-ink-muted transition hover:border-brand hover:text-brand-text disabled:opacity-50"
            >
              <IconPlus />
              {enviando ? "Enviando..." : "Adicionar imagem"}
              <span className="text-[11px] text-ink-faint">1600 × 640 px</span>
            </button>
          </li>
        )}
      </ul>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(e) => enviar(e.target.files)}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      />
    </div>
  );
}
