"use client";

import { useTransition } from "react";
import { atualizarNomeNegocio } from "./actions";

export function PerfilForm({ nomeNegocio, email }: { nomeNegocio: string; email: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <form
      action={(formData) => startTransition(() => atualizarNomeNegocio(formData))}
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
    >
      <div className="flex-1">
        <label className="mb-1 block text-xs text-neutral-400">Nome do negócio</label>
        <input
          name="nome_negocio"
          defaultValue={nomeNegocio}
          required
          className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
        />
      </div>
      <div className="flex-1">
        <label className="mb-1 block text-xs text-neutral-400">E-mail</label>
        <input
          value={email}
          disabled
          className="w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-500"
        />
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-emerald-400 disabled:opacity-50"
      >
        {isPending ? "Salvando..." : "Salvar"}
      </button>
    </form>
  );
}
