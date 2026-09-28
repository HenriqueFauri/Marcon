"use client";

import { useTransition } from "react";
import { excluirCliente } from "./actions";

export function ExcluirClienteButton({ id, nome }: { id: string; nome: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      disabled={isPending}
      onClick={() => {
        if (confirm(`Excluir "${nome}"? As vendas já feitas pra ele mantêm o nome dele registrado.`)) {
          startTransition(() => excluirCliente(id));
        }
      }}
      className="rounded-md px-2 py-1 text-xs text-neutral-400 hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"
    >
      Excluir
    </button>
  );
}
