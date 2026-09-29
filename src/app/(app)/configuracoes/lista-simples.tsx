"use client";

import { useRef } from "react";
import type { ActionResult } from "@/lib/action";
import { useAction } from "@/components/use-action";
import { ConfirmButton } from "@/components/confirm-button";
import { btnPrimary, inputClass } from "@/components/ui";

interface Item {
  id: string;
  nome: string;
}

export function ListaSimples({
  itens,
  placeholder,
  sugestoes = [],
  onCriar,
  onExcluir,
}: {
  itens: Item[];
  placeholder: string;
  sugestoes?: string[];
  onCriar: (formData: FormData) => Promise<ActionResult>;
  onExcluir: (id: string) => Promise<ActionResult>;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const { isPending, run } = useAction();
  const existentes = new Set(itens.map((i) => i.nome.toLowerCase()));
  const faltando = sugestoes.filter((s) => !existentes.has(s.toLowerCase()));

  function adicionar(nome: string) {
    const fd = new FormData();
    fd.set("nome", nome);
    run(() => onCriar(fd));
  }

  return (
    <div>
      <form
        ref={formRef}
        action={(formData) => run(() => onCriar(formData), { onSuccess: () => formRef.current?.reset() })}
        className="mb-3 flex gap-2"
      >
        <input name="nome" required placeholder={placeholder} aria-label={placeholder} className={`${inputClass} flex-1`} />
        <button type="submit" disabled={isPending} className={`${btnPrimary} shrink-0`}>
          Adicionar
        </button>
      </form>

      {faltando.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-ink-muted">Sugestões:</span>
          {faltando.map((s) => (
            <button
              key={s}
              type="button"
              disabled={isPending}
              onClick={() => adicionar(s)}
              className="rounded-full border border-line-strong px-2.5 py-0.5 text-xs text-ink-2 hover:border-brand hover:text-brand-text disabled:opacity-50"
            >
              + {s}
            </button>
          ))}
        </div>
      )}

      {itens.length === 0 ? (
        <p className="text-sm text-ink-muted">Nenhum item cadastrado ainda.</p>
      ) : (
        <ul className="divide-y divide-line rounded-2xl border border-line">
          {itens.map((item) => (
            <li key={item.id} className="flex items-center justify-between px-3 py-1.5 text-sm">
              <span className="text-ink">{item.nome}</span>
              <ConfirmButton
                title={`Excluir “${item.nome}”?`}
                description="Vendas antigas mantêm o nome registrado."
                ariaLabel={`Excluir ${item.nome}`}
                onConfirm={() => onExcluir(item.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
