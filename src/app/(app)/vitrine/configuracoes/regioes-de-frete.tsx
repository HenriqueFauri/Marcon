"use client";

import { useRef } from "react";
import { useAction } from "@/components/use-action";
import { ConfirmButton } from "@/components/confirm-button";
import { Field, btnSecondary, inputClass } from "@/components/ui";
import { rotuloDoFrete } from "@/lib/vitrine";
import { Grupo } from "../campos";
import { criarRegiaoDeFrete, excluirRegiaoDeFrete } from "../actions";

export interface RegiaoDaLista {
  id: string;
  nome: string;
  valor: number;
}

// Frete por bairro ou região: o cliente escolhe a dele no pedido. Fora da lista vale o frete fixo.
export function RegioesDeFrete({ regioes }: { regioes: RegiaoDaLista[] }) {
  const { isPending, run } = useAction();
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <Grupo
      titulo="Frete por região"
      semPadding={regioes.length > 0}
      rodape="O cliente escolhe a região no pedido. Quem não achar a dele usa o frete fixo acima (vazio = a combinar). Valor 0 mostra frete grátis."
    >
      {regioes.length > 0 && (
        <ul className="divide-y divide-line">
          {regioes.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-4 py-3">
              <span className="min-w-0 flex-1 truncate text-[17px] text-ink">{r.nome}</span>
              <span className="shrink-0 text-[15px] tabular-nums text-ink-muted">{rotuloDoFrete(Number(r.valor))}</span>
              <ConfirmButton
                title={`Remover ${r.nome}?`}
                description="Pedidos já feitos não mudam."
                onConfirm={() => excluirRegiaoDeFrete(r.id)}
                ariaLabel={`Remover a região ${r.nome}`}
              />
            </li>
          ))}
        </ul>
      )}
      <form
        ref={formRef}
        action={(formData) => run(() => criarRegiaoDeFrete(formData), { onSuccess: () => formRef.current?.reset() })}
        className={`flex flex-col gap-3 ${regioes.length > 0 ? "border-t border-line px-4 py-3" : ""}`}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_10rem]">
          <Field label="Bairro ou região">
            <input name="nome" required maxLength={60} placeholder="Centro" className={inputClass} autoCapitalize="words" />
          </Field>
          <Field label="Frete (R$)">
            <input name="valor" inputMode="decimal" required placeholder="8,00" className={inputClass} />
          </Field>
        </div>
        <button type="submit" disabled={isPending} className={`${btnSecondary} w-full py-3 sm:w-auto sm:self-start`}>
          {isPending ? "Adicionando..." : "Adicionar região"}
        </button>
      </form>
    </Grupo>
  );
}
