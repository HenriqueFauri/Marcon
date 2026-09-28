"use client";

import { useTransition } from "react";
import { excluirFornecedor } from "./actions";

export function ExcluirFornecedorButton({ id, nome }: { id: string; nome: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      disabled={isPending}
      onClick={() => {
        if (confirm(`Excluir "${nome}"? Compras já registradas com ele mantêm o nome dele registrado.`)) {
          startTransition(() => excluirFornecedor(id));
        }
      }}
      className="rounded-md px-2 py-1 text-xs text-neutral-400 hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"
    >
      Excluir
    </button>
  );
}
