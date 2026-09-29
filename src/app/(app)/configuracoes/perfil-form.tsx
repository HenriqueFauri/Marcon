"use client";

import { useTransition } from "react";
import { atualizarPerfil } from "./actions";

export function PerfilForm({
  nome,
  nomeNegocio,
  email,
}: {
  nome: string;
  nomeNegocio: string;
  email: string;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <form
      action={(formData) => startTransition(() => atualizarPerfil(formData))}
      className="flex flex-col gap-3"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs text-neutral-400">Seu nome</label>
          <input
            name="nome"
            defaultValue={nome}
            required
            className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-neutral-400">Nome do negócio</label>
          <input
            name="nome_negocio"
            defaultValue={nomeNegocio}
            required
            className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
          />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs text-neutral-400">E-mail da conta</label>
        <input
          value={email}
          disabled
          className="w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-500"
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
  );
}
