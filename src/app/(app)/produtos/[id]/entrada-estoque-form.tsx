"use client";

import { useRef, useTransition } from "react";
import { registrarEntradaEstoque } from "../actions";

export function EntradaEstoqueForm({
  produtoId,
  custoAtual,
}: {
  produtoId: string;
  custoAtual: number;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <form
      ref={formRef}
      action={(formData) =>
        startTransition(async () => {
          await registrarEntradaEstoque(formData);
          formRef.current?.reset();
        })
      }
      className="grid grid-cols-4 gap-3"
    >
      <input type="hidden" name="produto_id" value={produtoId} />
      <div>
        <label className="mb-1 block text-xs text-neutral-400">Quantidade</label>
        <input
          name="quantidade"
          type="number"
          min="1"
          required
          className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-neutral-400">Preço unitário (R$)</label>
        <input
          name="valor_unitario"
          type="number"
          step="0.01"
          min="0"
          defaultValue={custoAtual || undefined}
          required
          className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-neutral-400">Fornecedor</label>
        <input
          name="fornecedor_nome"
          className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
          placeholder="Opcional"
        />
      </div>
      <div className="flex items-end">
        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-emerald-400 disabled:opacity-50"
        >
          {isPending ? "Salvando..." : "Registrar"}
        </button>
      </div>
    </form>
  );
}
