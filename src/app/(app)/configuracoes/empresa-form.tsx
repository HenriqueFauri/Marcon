"use client";

import { useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { atualizarEmpresa, atualizarLogoEmpresa } from "./actions";

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
  const [isPending, startTransition] = useTransition();
  const [isUploading, setIsUploading] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);

  async function handleLogoUpload(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setLogoError(null);
    setIsUploading(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("não autenticado");

      const ext = file.name.split(".").pop();
      const path = `${user.id}/logo.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("logo-empresa")
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;

      await atualizarLogoEmpresa(path);
    } catch (e) {
      setLogoError(e instanceof Error ? e.message : "erro ao enviar logo");
    } finally {
      setIsUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <form
        action={(formData) => startTransition(() => atualizarEmpresa(formData))}
        className="flex flex-col gap-3"
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-neutral-400">Telefone</label>
            <input
              name="empresa_telefone"
              defaultValue={telefone}
              placeholder="(11) 99999-9999"
              className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-neutral-400">E-mail de contato</label>
            <input
              name="empresa_email"
              type="email"
              defaultValue={email}
              placeholder="contato@empresa.com"
              className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs text-neutral-400">Endereço</label>
          <textarea
            name="empresa_endereco"
            defaultValue={endereco}
            rows={2}
            placeholder="Rua, número, bairro, cidade..."
            className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-neutral-400">CPF / CNPJ</label>
          <input
            name="empresa_documento"
            defaultValue={documento}
            placeholder="Opcional"
            className="w-full max-w-xs rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
          />
        </div>
        <div>
          <button
            type="submit"
            disabled={isPending}
            className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-emerald-400 disabled:opacity-50"
          >
            {isPending ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </form>

      <div className="border-t border-neutral-800 pt-4">
        <label className="mb-2 block text-xs text-neutral-400">Logo da empresa</label>
        <div className="flex items-center gap-3">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="Logo da empresa" className="h-12 w-12 rounded-lg object-cover" />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-neutral-800 text-xs text-neutral-500">
              sem logo
            </div>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            onChange={(e) => handleLogoUpload(e.target.files)}
            disabled={isUploading}
            className="text-sm text-neutral-300 file:mr-3 file:rounded-lg file:border-0 file:bg-neutral-800 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-neutral-700"
          />
        </div>
        {isUploading && <p className="mt-2 text-xs text-neutral-500">Enviando...</p>}
        {logoError && <p className="mt-2 text-xs text-red-400">{logoError}</p>}
      </div>
    </div>
  );
}
