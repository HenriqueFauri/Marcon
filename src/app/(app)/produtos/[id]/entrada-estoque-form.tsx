"use client";

import { useRef, useState } from "react";
import type { Fornecedor, ProdutoVariacao } from "@/types/domain";
import { formatBRL } from "@/lib/format";
import { useAction } from "@/components/use-action";
import { Field, btnPrimary, inputClass } from "@/components/ui";
import { registrarEntradaEstoque } from "../actions";

function paraNumero(v: string) {
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export function EntradaEstoqueForm({
  produtoId,
  custoAtual,
  variacoes,
  fornecedores,
  fornecedorPadrao,
  hoje,
}: {
  produtoId: string;
  custoAtual: number;
  variacoes: ProdutoVariacao[];
  fornecedores: Fornecedor[];
  fornecedorPadrao: string | null;
  hoje: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const { isPending, run } = useAction();
  const [fornecedorId, setFornecedorId] = useState(
    fornecedorPadrao && fornecedores.some((f) => f.id === fornecedorPadrao) ? fornecedorPadrao : "",
  );
  const [quantidade, setQuantidade] = useState("");
  const [valor, setValor] = useState(custoAtual ? custoAtual.toFixed(2) : "");
  const total = paraNumero(quantidade) * paraNumero(valor);

  return (
    <form
      ref={formRef}
      action={(formData) =>
        run(() => registrarEntradaEstoque(formData), {
          onSuccess: () => setQuantidade(""),
        })
      }
      className="flex flex-col gap-4"
    >
      <input type="hidden" name="produto_id" value={produtoId} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {variacoes.length > 0 && (
          <Field label="Variação" className="col-span-2 sm:col-span-1">
            <select name="variacao_id" required className={inputClass}>
              {variacoes.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nome_combinacao} ({v.estoque})
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Quantidade *">
          <input
            name="quantidade"
            type="number"
            inputMode="numeric"
            min="1"
            step="1"
            required
            value={quantidade}
            onChange={(e) => setQuantidade(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Custo unitário (R$) *">
          <input
            name="valor_unitario"
            inputMode="decimal"
            required
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Data da compra">
          <input name="data" type="date" defaultValue={hoje} max={hoje} className={inputClass} />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Field label="Fornecedor">
            <select
              value={fornecedorId}
              onChange={(e) => setFornecedorId(e.target.value)}
              name="fornecedor_id"
              className={inputClass}
            >
              <option value="">Sem cadastro / digitar</option>
              {fornecedores.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
            </select>
          </Field>
          {!fornecedorId && (
            <input name="fornecedor_nome" aria-label="Nome do fornecedor" className={inputClass} placeholder="Nome (opcional)" />
          )}
        </div>
        <Field label="Observação">
          <input name="observacoes" className={inputClass} placeholder="Ex: nota fiscal 123" />
        </Field>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-800 pt-4">
        <p className="text-sm text-neutral-400">
          Total da compra: <strong className="tabular-nums text-white">{formatBRL(total)}</strong>
          <span className="block text-xs text-neutral-500">Sai do caixa como &quot;Fornecimento&quot;.</span>
        </p>
        <button type="submit" disabled={isPending} className={btnPrimary}>
          {isPending ? "Salvando..." : "Registrar entrada"}
        </button>
      </div>
    </form>
  );
}
