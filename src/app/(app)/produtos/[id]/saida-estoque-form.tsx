"use client";

import { useState } from "react";
import type { ProdutoVariacao } from "@/types/domain";
import { useAction } from "@/components/use-action";
import { Field, btnPrimary, inputClass } from "@/components/ui";
import { registrarSaidaEstoque } from "../actions";

const MOTIVOS = [
  { valor: "perda", rotulo: "Perda ou quebra" },
  { valor: "uso", rotulo: "Uso próprio ou brinde" },
  { valor: "ajuste", rotulo: "Ajuste de contagem" },
];

export function SaidaEstoqueForm({
  produtoId,
  variacoes,
  hoje,
  onConcluido,
}: {
  produtoId: string;
  variacoes: ProdutoVariacao[];
  hoje: string;
  onConcluido: () => void;
}) {
  const { isPending, run } = useAction();
  const [quantidade, setQuantidade] = useState("");

  return (
    <form
      action={(formData) => run(() => registrarSaidaEstoque(formData), { onSuccess: onConcluido })}
      className="flex flex-col gap-4"
    >
      <input type="hidden" name="produto_id" value={produtoId} />
      {variacoes.length > 0 && (
        <Field label="Variação">
          <select name="variacao_id" required className={inputClass}>
            {variacoes.map((v) => (
              <option key={v.id} value={v.id}>
                {v.nome_combinacao} ({v.estoque})
              </option>
            ))}
          </select>
        </Field>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Quantidade *">
          <input
            name="quantidade"
            type="number"
            inputMode="numeric"
            min="1"
            step="1"
            required
            autoFocus
            value={quantidade}
            onChange={(e) => setQuantidade(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Data">
          <input name="data" type="date" defaultValue={hoje} max={hoje} className={inputClass} />
        </Field>
      </div>
      <Field label="Motivo *">
        <select name="motivo" required defaultValue="perda" className={inputClass}>
          {MOTIVOS.map((m) => (
            <option key={m.valor} value={m.valor}>
              {m.rotulo}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Observação">
        <input name="observacoes" className={inputClass} placeholder="Ex: caixa amassada na entrega" />
      </Field>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <p className="text-xs text-ink-muted">Baixa o estoque e fica no histórico. Não mexe no caixa.</p>
        <button type="submit" disabled={isPending} className={btnPrimary}>
          {isPending ? "Salvando..." : "Registrar saída"}
        </button>
      </div>
    </form>
  );
}
