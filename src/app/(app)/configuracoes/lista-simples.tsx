"use client";

import { useRef, useTransition } from "react";

interface Item {
  id: string;
  nome: string;
}

export function ListaSimples({
  itens,
  placeholder,
  onCriar,
  onExcluir,
}: {
  itens: Item[];
  placeholder: string;
  onCriar: (formData: FormData) => Promise<void>;
  onExcluir: (id: string) => Promise<void>;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div>
      <form
        ref={formRef}
        action={(formData) =>
          startTransition(async () => {
            await onCriar(formData);
            formRef.current?.reset();
          })
        }
        className="mb-3 flex gap-2"
      >
        <input
          name="nome"
          required
          placeholder={placeholder}
          className="flex-1 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
        />
        <button
          type="submit"
          disabled={isPending}
          className="shrink-0 rounded-lg bg-emerald-500 px-3 py-2 text-sm font-medium text-neutral-950 hover:bg-emerald-400 disabled:opacity-50"
        >
          Adicionar
        </button>
      </form>

      {itens.length === 0 ? (
        <p className="text-sm text-neutral-500">Nenhum item cadastrado ainda.</p>
      ) : (
        <ul className="divide-y divide-neutral-800 rounded-lg border border-neutral-800">
          {itens.map((item) => (
            <li key={item.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <span className="text-white">{item.nome}</span>
              <button
                onClick={() => {
                  if (confirm(`Excluir "${item.nome}"?`)) startTransition(() => onExcluir(item.id));
                }}
                className="rounded-md px-2 py-1 text-xs text-neutral-400 hover:bg-red-500/10 hover:text-red-400"
              >
                Excluir
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
