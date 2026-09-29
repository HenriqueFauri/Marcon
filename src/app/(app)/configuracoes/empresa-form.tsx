"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { mensagemDeErro } from "@/lib/action";
import { useAction } from "@/components/use-action";
import { useToast } from "@/components/toaster";
import { Field, btnGhost, btnPrimary, btnSecondary, inputClass } from "@/components/ui";
import { atualizarEmpresa, atualizarLogoEmpresa } from "./actions";

const TAMANHO_MAX = 2 * 1024 * 1024;

export function EmpresaForm({
  telefone,
  email,
  endereco,
  documento,
  logoUrl,
}: {
  telefone: string;
  email: string;
  endereco: string;
  documento: string;
  logoUrl: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { isPending, run } = useAction();
  const toast = useToast();
  const [enviando, setEnviando] = useState(false);

  async function handleLogoUpload(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    if (file.size > TAMANHO_MAX) {
      toast.error("O logo precisa ter no máximo 2 MB.");
      return;
    }
    setEnviando(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("não autenticado");

      const ext = (file.name.split(".").pop() ?? "png").toLowerCase().replace(/[^a-z0-9]/g, "");
      // nome novo a cada envio: evita o navegador mostrar o logo antigo do cache
      const path = `${user.id}/logo-${Date.now()}.${ext || "png"}`;
      const { error: uploadError } = await supabase.storage
        .from("logo-empresa")
        .upload(path, file, { upsert: true, contentType: file.type || undefined });
      if (uploadError) throw uploadError;

      const r = await atualizarLogoEmpresa(path);
      if (!r.ok) throw new Error(r.error);
      toast.success("Logo atualizado.");
    } catch (e) {
      toast.error(mensagemDeErro(e, "Erro ao enviar o logo."));
    } finally {
      setEnviando(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-4">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="Logo da empresa" className="h-16 w-16 rounded-xl border border-neutral-800 object-cover" />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-xl border border-dashed border-neutral-700 text-xs text-neutral-500">
            sem logo
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => inputRef.current?.click()} disabled={enviando} className={btnSecondary}>
            {enviando ? "Enviando..." : logoUrl ? "Trocar logo" : "Enviar logo"}
          </button>
          {logoUrl && (
            <button type="button" onClick={() => run(() => atualizarLogoEmpresa(null))} disabled={isPending} className={btnGhost}>
              Remover
            </button>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          onChange={(e) => handleLogoUpload(e.target.files)}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
        />
      </div>

      <form action={(formData) => run(() => atualizarEmpresa(formData))} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Telefone">
            <input name="empresa_telefone" type="tel" defaultValue={telefone} placeholder="(11) 99999-9999" className={inputClass} />
          </Field>
          <Field label="E-mail de contato">
            <input name="empresa_email" type="email" defaultValue={email} placeholder="contato@empresa.com" className={inputClass} />
          </Field>
        </div>
        <Field label="Endereço">
          <textarea name="empresa_endereco" defaultValue={endereco} rows={2} placeholder="Rua, número, bairro, cidade..." className={inputClass} />
        </Field>
        <Field label="CPF / CNPJ" className="sm:max-w-xs">
          <input name="empresa_documento" defaultValue={documento} placeholder="Opcional" className={inputClass} />
        </Field>
        <div>
          <button type="submit" disabled={isPending} className={btnPrimary}>
            {isPending ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </form>
    </div>
  );
}
