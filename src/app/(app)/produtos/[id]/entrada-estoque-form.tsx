"use client";

import { useRef, useState, useTransition } from "react";
import type { Fornecedor, ProdutoVariacao } from "@/types/domain";
import { registrarEntradaEstoque } from "../actions";

export function EntradaEstoqueForm({
  produtoId,
  custoAtual,
  variacoes,
  fornecedores,
}: {
  produtoId: string;
  custoAtual: number;
  variacoes: ProdutoVariacao[];
  fornecedores: Fornecedor[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [fornecedorId, setFornecedorId] = useState("");
  const [isPending, startTransition] = useTransition();

  return (
    <form
      ref={formRef}
      action={(formData) =>
        startTransition(async () => {
          await registrarEntradaEstoque(formData);
          formRef.current?.reset();
          setFornecedorId("");
        })
      }
      className="grid grid-cols-2 gap-3 sm:grid-cols-5"
    >
      <input type="hidden" name="produto_id" value={produtoId} />

      {variacoes.length > 0 && (
        <div>
          <label className="mb-1 block text-xs text-neutral-400">Variação</label>
          <select
            name="variacao_id"
            required
            className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
          >
            {variacoes.map((v) => (
              <option key={v.id} value={v.id}>
                {v.nome_combinacao} ({v.estoque} em estoque)
              </option>
            ))}
          </select>
        </div>
      )}

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
        <select
          value={fornecedorId}
          onChange={(e) => setFornecedorId(e.target.value)}
          name="fornecedor_id"
          className="mb-1 w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
        >
          <option value="">Sem cadastro / digitar</option>
          {fornecedores.map((f) => (
            <option key={f.id} value={f.id}>
              {f.nome}
            </option>
          ))}
        </select>
        {!fornecedorId && (
          <input
            name="fornecedor_nome"
            className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
            placeholder="Opcional"
          />
        )}
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
