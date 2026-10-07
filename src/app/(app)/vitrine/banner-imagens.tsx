"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { mensagemDeErro } from "@/lib/action";
import { useAction } from "@/components/use-action";
import { useToast } from "@/components/toaster";
import { TAMANHO_ENVIO_MAX, TAMANHO_ORIGINAL_MAX, comprimirImagem } from "@/lib/imagem";
import { BANNER_MAX_IMAGENS } from "@/lib/vitrine";
import { btnGhost, btnSecondary } from "@/components/ui";
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
      <p className="mb-1.5 text-[13px] font-medium text-ink-muted">
        Imagens ({imagens.length}/{BANNER_MAX_IMAGENS})
      </p>
      <p className="mb-2 text-xs text-ink-muted">
        Ideal: 1600 × 640 px (proporção 5:2). Imagens de outro formato são cortadas ao centro. JPG, PNG ou WEBP.
      </p>
      {imagens.length > 0 && (
        <ul className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {imagens.map((img) => (
            <li key={img.path} className="overflow-hidden rounded-xl border border-line bg-fill">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt="Imagem do banner" className="aspect-[5/2] w-full object-cover" />
              <button
                type="button"
                disabled={isPending}
                onClick={() => run(() => removerImagemBanner(img.path))}
                className={`${btnGhost} w-full rounded-none py-2 text-sm`}
              >
                Remover
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={!habilitado || cheio || enviando}
        className={btnSecondary}
      >
        {enviando ? "Enviando..." : cheio ? "Limite de imagens atingido" : "Adicionar imagem"}
      </button>
      {!habilitado && <p className="mt-1.5 text-xs text-ink-muted">Salve a vitrine primeiro para poder enviar imagens.</p>}
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
