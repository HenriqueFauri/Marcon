"use client";

import { useRef } from "react";
import type { ActionResult } from "@/lib/action";
import { useAction } from "@/components/use-action";
import { ConfirmButton } from "@/components/confirm-button";
import { Grupo } from "@/components/ajustes";
import { btnSecondary, btnSmallNeutro, inputClass } from "@/components/ui";

interface Item {
  id: string;
  nome: string;
}

// lista de nomes (canais, formas de pagamento) como linhas de um Grupo: os itens em cima,
// o campo de adicionar e as sugestões na última linha
export function ListaSimples({
  titulo,
  rodape,
  itens,
  placeholder,
  sugestoes = [],
  onCriar,
  onExcluir,
}: {
  titulo: string;
  rodape?: string;
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
    <Grupo titulo={titulo} rodape={rodape} semPadding>
      {itens.map((item) => (
        <div key={item.id} className="flex items-center gap-3 border-t border-line px-4 py-3 first:border-t-0">
          <span className="min-w-0 flex-1 truncate text-[17px] text-ink">{item.nome}</span>
          <ConfirmButton
            title={`Remover “${item.nome}”?`}
            description="Vendas antigas mantêm o nome registrado."
            confirmLabel="Remover"
            ariaLabel={`Remover ${item.nome}`}
            onConfirm={() => onExcluir(item.id)}
            className="shrink-0 text-[15px] text-danger hover:opacity-80"
          >
            Remover
          </ConfirmButton>
        </div>
      ))}

      <div className="flex flex-col gap-3 border-t border-line px-4 py-3 first:border-t-0">
        <form
          ref={formRef}
          action={(formData) => run(() => onCriar(formData), { onSuccess: () => formRef.current?.reset() })}
          className="flex gap-2"
        >
          <input name="nome" required placeholder={placeholder} aria-label={placeholder} className={`${inputClass} flex-1`} />
          <button type="submit" disabled={isPending} className={`${btnSecondary} shrink-0`}>
            Adicionar
          </button>
        </form>

        {faltando.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {faltando.map((s) => (
              <button key={s} type="button" disabled={isPending} onClick={() => adicionar(s)} className={btnSmallNeutro}>
                + {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </Grupo>
  );
}
