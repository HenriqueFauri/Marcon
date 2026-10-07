"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAction } from "@/components/use-action";
import { inputClass } from "@/components/ui";
import { COMISSAO_MAXIMA, COMISSAO_PERCENTUAL } from "@/lib/indicacao";
import { definirPercentualAfiliado } from "../actions";

const link = "whitespace-nowrap text-[13px] font-medium text-brand-text hover:underline disabled:opacity-50";

export function PercentualAfiliado({ id, atual }: { id: string; atual: number | null }) {
  const router = useRouter();
  const { isPending, run } = useAction();
  const [valor, setValor] = useState(atual === null ? "" : String(atual));

  const digitado = valor.trim() === "" ? null : Number(valor.replace(",", "."));
  const mudou = digitado !== atual;

  return (
    <div className="flex items-center justify-end gap-3">
      <div className="relative">
        <input
          type="text"
          inputMode="decimal"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          placeholder={String(COMISSAO_PERCENTUAL)}
          aria-label={`Percentual de comissão (padrão ${COMISSAO_PERCENTUAL}%, máximo ${COMISSAO_MAXIMA}%)`}
          className={`${inputClass} w-20 pr-6 text-right tabular-nums`}
        />
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[13px] text-ink-muted">%</span>
      </div>
      <button
        type="button"
        className={link}
        disabled={isPending || !mudou}
        onClick={() => run(() => definirPercentualAfiliado(id, digitado), { onSuccess: () => router.refresh() })}
      >
        Salvar
      </button>
    </div>
  );
}
