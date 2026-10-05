"use client";

import { useState } from "react";
import type { ProdutoVariacao } from "@/types/domain";
import { useAction } from "@/components/use-action";
import { Field, btnPrimary, inputClass } from "@/components/ui";
import { ajustarEstoque } from "../actions";

// O usuário diz quantas unidades tem de verdade; o app calcula a diferença.
// Não mexe no caixa nem no custo: serve para corrigir a contagem.
export function AjusteEstoqueForm({
  produtoId,
  estoqueAtual,
  variacoes,
  onConcluido,
}: {
  produtoId: string;
  estoqueAtual: number;
  variacoes: ProdutoVariacao[];
  onConcluido: () => void;
}) {
  const { isPending, run } = useAction();
  const [variacaoId, setVariacaoId] = useState(variacoes[0]?.id ?? "");
  const atual = variacoes.length > 0 ? (variacoes.find((v) => v.id === variacaoId)?.estoque ?? 0) : estoqueAtual;
  // o campo acompanha a variação escolhida até o usuário digitar
  const [digitado, setDigitado] = useState<string | null>(null);
  const valor = digitado ?? String(atual);
  const novo = Number(valor);
  const diferenca = Number.isInteger(novo) && novo >= 0 ? novo - atual : null;

  return (
    <form
      action={(formData) => run(() => ajustarEstoque(formData), { onSuccess: onConcluido })}
      className="flex flex-col gap-4"
    >
      <input type="hidden" name="produto_id" value={produtoId} />
      {variacoes.length > 0 && (
        <Field label="Variação">
          <select
            name="variacao_id"
            required
            value={variacaoId}
            onChange={(e) => {
              setVariacaoId(e.target.value);
              setDigitado(null);
            }}
            className={inputClass}
          >
            {variacoes.map((v) => (
              <option key={v.id} value={v.id}>
                {v.nome_combinacao} ({v.estoque})
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field label="Quantas unidades você tem agora? *" hint={`O app mostra ${atual}.`}>
        <input
          name="novo_estoque"
          type="number"
          inputMode="numeric"
          min="0"
          step="1"
          required
          autoFocus
          value={valor}
          onChange={(e) => setDigitado(e.target.value)}
          className={inputClass}
        />
      </Field>
      <Field label="Observação">
        <input name="observacoes" className={inputClass} placeholder="Ex: venda cancelada que não devolveu" />
      </Field>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <p className="text-xs text-ink-muted">
          {diferenca === null || diferenca === 0
            ? "Corrige a contagem. Não mexe no caixa nem no custo."
            : `${diferenca > 0 ? "Soma" : "Tira"} ${Math.abs(diferenca)} ${Math.abs(diferenca) === 1 ? "unidade" : "unidades"}. Não mexe no caixa nem no custo.`}
        </p>
        <button type="submit" disabled={isPending || diferenca === null || diferenca === 0} className={btnPrimary}>
          {isPending ? "Salvando..." : "Ajustar estoque"}
        </button>
      </div>
    </form>
  );
}
