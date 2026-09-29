"use client";

import { useRef } from "react";
import type { ProdutoVariacao } from "@/types/domain";
import { formatBRL } from "@/lib/format";
import { useAction } from "@/components/use-action";
import { ConfirmButton } from "@/components/confirm-button";
import { Badge, Field, btnSecondary, inputClass } from "@/components/ui";
import { IconPlus } from "@/components/icons";
import { criarVariacao, excluirVariacao } from "../actions";

export function VariacoesSection({
  produtoId,
  variacoes,
  precoPadrao,
}: {
  produtoId: string;
  variacoes: ProdutoVariacao[];
  precoPadrao: number;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const { isPending, run } = useAction();

  return (
    <div>
      {variacoes.length > 0 ? (
        <ul className="mb-5 divide-y divide-neutral-800 rounded-lg border border-neutral-800">
          {variacoes.map((v) => (
            <li key={v.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-white">{v.nome_combinacao}</p>
                <p className="text-xs text-neutral-500">
                  {[
                    v.sku && `SKU ${v.sku}`,
                    v.custo != null && `custo ${formatBRL(v.custo)}`,
                    `venda ${formatBRL(v.preco_venda ?? precoPadrao)}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <Badge tone={v.estoque > 0 ? "positive" : "negative"}>{v.estoque} em estoque</Badge>
              <ConfirmButton
                title={`Excluir a variação “${v.nome_combinacao}”?`}
                description={v.estoque > 0 ? `Ela ainda tem ${v.estoque} unidade(s) em estoque, que deixarão de ser contadas.` : undefined}
                ariaLabel={`Excluir variação ${v.nome_combinacao}`}
                onConfirm={() => excluirVariacao(v.id, produtoId)}
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
          Nenhuma variação ainda. Adicione a primeira abaixo (ex: &quot;Azul / M&quot;).
        </p>
      )}

      <form
        ref={formRef}
        action={(formData) => run(() => criarVariacao(formData), { onSuccess: () => formRef.current?.reset() })}
        className="grid grid-cols-2 gap-3 sm:grid-cols-4"
      >
        <input type="hidden" name="produto_id" value={produtoId} />
        <Field label="Nome *" className="col-span-2 sm:col-span-1">
          <input name="nome_combinacao" required className={inputClass} placeholder="Ex: Azul / M" />
        </Field>
        <Field label="SKU">
          <input name="sku" className={inputClass} placeholder="Opcional" />
        </Field>
        <Field label="Custo (R$)">
          <input name="custo" inputMode="decimal" className={inputClass} placeholder="Igual ao produto" />
        </Field>
        <Field label="Preço de venda (R$)">
          <input name="preco_venda" inputMode="decimal" className={inputClass} placeholder={formatBRL(precoPadrao)} />
        </Field>
        <div className="col-span-2 sm:col-span-4">
          <button type="submit" disabled={isPending} className={btnSecondary}>
            <IconPlus width={16} height={16} />
            {isPending ? "Salvando..." : "Adicionar variação"}
          </button>
        </div>
      </form>
    </div>
  );
}
