"use client";

import { useAction } from "@/components/use-action";
import { IconCheck } from "@/components/icons";
import { marcarParcelaPaga } from "./actions";

export function MarcarPagoButton({ id }: { id: string }) {
  const { isPending, run } = useAction();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => run(() => marcarParcelaPaga(id))}
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-on-brand transition hover:bg-brand-hover disabled:opacity-50"
    >
      <IconCheck width={14} height={14} />
      {isPending ? "Salvando..." : "Recebi"}
    </button>
  );
}
