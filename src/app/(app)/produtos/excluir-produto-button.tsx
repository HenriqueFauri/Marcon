"use client";

import { useState, useTransition } from "react";
import { excluirProduto } from "./actions";

export function ExcluirProdutoButton({ produtoId, nome }: { produtoId: string; nome: string }) {
  const [open, setOpen] = useState(false);
  const [apagarHistorico, setApagarHistorico] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-md px-2 py-1 text-xs text-neutral-400 hover:bg-red-500/10 hover:text-red-400"
      >
        Excluir
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-sm rounded-xl border border-neutral-800 bg-neutral-900 p-5">
        <h2 className="mb-1 text-base font-semibold text-white">Excluir &ldquo;{nome}&rdquo;?</h2>
        <p className="mb-4 text-sm text-neutral-400">
          O produto será apagado. As compras e lançamentos de caixa que ele já gerou são seus —
          escolha o que fazer com eles.
        </p>

        <label className="mb-4 flex items-start gap-2 text-sm text-neutral-300">
          <input
            type="checkbox"
            checked={apagarHistorico}
            onChange={(e) => setApagarHistorico(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            Apagar também o histórico de estoque e os lançamentos de caixa deste produto
            <span className="block text-xs text-neutral-500">
              Desmarcado (padrão): o produto some, mas o dinheiro que ele já gerou continua nos
              seus relatórios.
            </span>
          </span>
        </label>

        <div className="flex justify-end gap-2">
          <button
            onClick={() => setOpen(false)}
            className="rounded-lg px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-800"
          >
            Cancelar
          </button>
          <button
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                await excluirProduto(produtoId, apagarHistorico);
                setOpen(false);
              })
            }
            className="rounded-lg bg-red-500 px-3 py-2 text-sm font-medium text-white hover:bg-red-400 disabled:opacity-50"
          >
            {isPending ? "Excluindo..." : "Excluir produto"}
          </button>
        </div>
      </div>
    </div>
  );
}
