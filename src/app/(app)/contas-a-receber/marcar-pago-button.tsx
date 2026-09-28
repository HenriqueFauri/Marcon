"use client";

import { useTransition } from "react";
import { marcarParcelaPaga } from "./actions";

export function MarcarPagoButton({ id }: { id: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      disabled={isPending}
      onClick={() => startTransition(() => marcarParcelaPaga(id))}
      className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-medium text-neutral-950 hover:bg-emerald-400 disabled:opacity-50"
    >
      {isPending ? "Salvando..." : "Marcar como paga"}
    </button>
  );
}
