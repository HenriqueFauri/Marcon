"use client";

import { useTransition } from "react";
import { excluirLancamento } from "./actions";

export function ExcluirLancamentoButton({ id }: { id: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      disabled={isPending}
      onClick={() => {
        if (confirm("Excluir este lançamento do fluxo de caixa?")) {
          startTransition(() => excluirLancamento(id));
        }
      }}
      className="rounded-md px-2 py-1 text-xs text-neutral-400 hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"
    >
      Excluir
    </button>
  );
}
