"use client";

import { useRef, useTransition } from "react";
import type { ProdutoVariacao } from "@/types/domain";
import { criarVariacao, excluirVariacao } from "../actions";

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function VariacoesSection({
  produtoId,
  variacoes,
}: {
  produtoId: string;
  variacoes: ProdutoVariacao[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div>
      {variacoes.length > 0 && (
        <div className="mb-4 overflow-hidden rounded-xl border border-neutral-800">
          <table className="w-full text-sm">
            <thead className="bg-neutral-900 text-left text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-2 font-medium">Variação</th>
                <th className="px-4 py-2 font-medium">SKU</th>
                <th className="px-4 py-2 font-medium">Custo</th>
                <th className="px-4 py-2 font-medium">Preço venda</th>
                <th className="px-4 py-2 font-medium">Estoque</th>
                <th className="px-4 py-2 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {variacoes.map((v) => (
                <tr key={v.id}>
                  <td className="px-4 py-2 text-white">{v.nome_combinacao}</td>
                  <td className="px-4 py-2 text-neutral-400">{v.sku ?? "—"}</td>
                  <td className="px-4 py-2 text-neutral-300">{v.custo ? formatBRL(v.custo) : "—"}</td>
                  <td className="px-4 py-2 text-neutral-300">
                    {v.preco_venda ? formatBRL(v.preco_venda) : "—"}
                  </td>
                  <td className="px-4 py-2 text-emerald-400">{v.estoque}</td>
                  <td className="px-4 py-2 text-right">
                    <button
                      disabled={isPending}
                      onClick={() => {
                        if (confirm(`Excluir a variação "${v.nome_combinacao}"?`)) {
                          startTransition(() => excluirVariacao(v.id, produtoId));
                        }
                      }}
                      className="rounded-md px-2 py-1 text-xs text-neutral-400 hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"
                    >
                      Excluir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form
        ref={formRef}
        action={(formData) =>
          startTransition(async () => {
            await criarVariacao(formData);
            formRef.current?.reset();
          })
        }
        className="grid grid-cols-2 gap-3 sm:grid-cols-5"
      >
        <input type="hidden" name="produto_id" value={produtoId} />
        <div className="col-span-2 sm:col-span-2">
          <label className="mb-1 block text-xs text-neutral-400">Nome (ex: Azul / M) *</label>
          <input
            name="nome_combinacao"
            required
            className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-neutral-400">SKU</label>
          <input
            name="sku"
            className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-neutral-400">Custo (R$)</label>
          <input
            name="custo"
            type="number"
            step="0.01"
            min="0"
            className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
          />
        </div>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="mb-1 block text-xs text-neutral-400">Preço venda (R$)</label>
            <input
              name="preco_venda"
              type="number"
              step="0.01"
              min="0"
              className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
            />
          </div>
        </div>
        <div className="col-span-2 sm:col-span-5">
          <button
            type="submit"
            disabled={isPending}
            className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-emerald-400 disabled:opacity-50"
          >
            {isPending ? "Salvando..." : "+ Adicionar variação"}
          </button>
        </div>
      </form>
      <p className="mt-2 text-xs text-neutral-500">
        Depois de criar a variação, registre o estoque dela em &quot;Registrar entrada de estoque&quot; acima.
      </p>
    </div>
  );
}
