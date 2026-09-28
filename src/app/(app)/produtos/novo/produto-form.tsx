"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Fornecedor } from "@/types/domain";
import { criarProduto } from "../actions";

const inputClass =
  "w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500";
const labelClass = "mb-1 block text-sm text-neutral-300";

export function ProdutoForm({ fornecedores }: { fornecedores: Fornecedor[] }) {
  const router = useRouter();
  const [temVariacoes, setTemVariacoes] = useState(false);
  const [fornecedorId, setFornecedorId] = useState("");
  const [isPending, startTransition] = useTransition();

  return (
    <form
      action={(formData) =>
        startTransition(async () => {
          await criarProduto(formData);
          router.push("/produtos");
        })
      }
      className="flex flex-col gap-5"
    >
      <div>
        <label className={labelClass}>Nome do produto *</label>
        <input name="nome" required className={inputClass} placeholder="Ex: Smartwatch Pro X" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Categoria</label>
          <input name="categoria" className={inputClass} placeholder="Ex: Eletrônicos" />
        </div>
        <div>
          <label className={labelClass}>Marca</label>
          <input name="marca" className={inputClass} placeholder="Opcional" />
        </div>
      </div>

      <div>
        <label className={labelClass}>Descrição</label>
        <textarea
          name="descricao"
          rows={3}
          className={inputClass}
          placeholder="Detalhes para catálogo, loja ou uso interno"
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className={labelClass}>Preço de custo (R$) *</label>
          <input name="custo" type="number" step="0.01" min="0" required className={inputClass} placeholder="0.00" />
        </div>
        <div>
          <label className={labelClass}>Preço varejo (R$) *</label>
          <input
            name="preco_varejo"
            type="number"
            step="0.01"
            min="0"
            required
            className={inputClass}
            placeholder="0.00"
          />
        </div>
        <div>
          <label className={labelClass}>Preço atacado (R$)</label>
          <input name="preco_atacado" type="number" step="0.01" min="0" className={inputClass} placeholder="Opcional" />
        </div>
      </div>

      <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-3">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-neutral-200">
          <input
            type="checkbox"
            name="tem_variacoes"
            value="true"
            checked={temVariacoes}
            onChange={(e) => setTemVariacoes(e.target.checked)}
            className="h-4 w-4 rounded border-neutral-600 bg-neutral-800"
          />
          Este produto tem variações (tamanho, cor...)
        </label>
        {temVariacoes && (
          <p className="mt-2 text-xs text-neutral-500">
            Depois de cadastrar, adicione as variações e o estoque de cada uma na página do produto.
            O estoque inicial abaixo fica desativado porque, com variações, o estoque é controlado por variação.
          </p>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className={labelClass}>Estoque inicial</label>
          <input
            name="estoque_inicial"
            type="number"
            min="0"
            defaultValue={0}
            disabled={temVariacoes}
            className={`${inputClass} disabled:opacity-40`}
          />
        </div>
        <div>
          <label className={labelClass}>Unidade</label>
          <select name="unidade_medida" defaultValue="un" className={inputClass}>
            <option value="un">Unidade (un)</option>
            <option value="kg">Quilo (kg)</option>
            <option value="cx">Caixa (cx)</option>
            <option value="par">Par</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Fornecedor</label>
          <select
            value={fornecedorId}
            onChange={(e) => setFornecedorId(e.target.value)}
            name="fornecedor_id"
            className={`${inputClass} mb-1`}
          >
            <option value="">Sem cadastro / digitar</option>
            {fornecedores.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </select>
          {!fornecedorId && (
            <input name="fornecedor_nome" className={inputClass} placeholder="Opcional" />
          )}
        </div>
      </div>

      <p className="text-xs text-neutral-500">
        O estoque inicial já entra como uma compra no histórico e gera a saída de caixa
        correspondente — nada fica de fora do fluxo de caixa.
      </p>

      <div className="flex justify-end gap-2 border-t border-neutral-800 pt-4">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-emerald-400 disabled:opacity-50"
        >
          {isPending ? "Salvando..." : "Cadastrar produto"}
        </button>
      </div>
    </form>
  );
}
