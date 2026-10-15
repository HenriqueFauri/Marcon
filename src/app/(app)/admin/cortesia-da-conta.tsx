"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmButton } from "@/components/confirm-button";
import { useAction } from "@/components/use-action";
import { Segmentado } from "@/components/ajustes";
import { btnPrimary, btnSecondary, inputClass } from "@/components/ui";
import { MOTIVOS_CORTESIA, PRAZOS_CORTESIA, type MotivoCortesia, type PrazoCortesia } from "@/lib/cortesia";
import { definirCortesia } from "./actions";

// Dar, renovar e tirar a cortesia de uma conta. O prazo conta o dia de hoje e vai de 7, 15 ou 30 dias.
export function CortesiaDaConta({ id, email, ativa }: { id: string; email: string; ativa: boolean }) {
  const router = useRouter();
  const { isPending, run } = useAction();
  const [dias, setDias] = useState<PrazoCortesia>(7);
  const [motivo, setMotivo] = useState<MotivoCortesia>("parceiro");

  return (
    <div className="flex flex-col gap-3">
      <Segmentado
        rotulo="Prazo da cortesia"
        valor={String(dias)}
        opcoes={PRAZOS_CORTESIA.map((d) => ({ valor: String(d), label: `${d} dias` }))}
        onMudar={(v) => setDias(Number(v) as PrazoCortesia)}
      />
      <select
        aria-label="Motivo da cortesia"
        className={inputClass}
        value={motivo}
        onChange={(e) => setMotivo(e.target.value as MotivoCortesia)}
      >
        {MOTIVOS_CORTESIA.map((m) => (
          <option key={m.valor} value={m.valor}>
            {m.label}
          </option>
        ))}
      </select>
      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          disabled={isPending}
          className={`${ativa ? btnSecondary : btnPrimary} w-full sm:w-auto`}
          onClick={() => run(() => definirCortesia(id, true, { dias, motivo }), { onSuccess: () => router.refresh() })}
        >
          {ativa ? `Renovar por ${dias} dias` : `Dar ${dias} dias`}
        </button>
        {ativa && (
          <ConfirmButton
            title="Tirar a cortesia?"
            description={`${email} volta ao teste ou ao plano grátis agora. Nada é apagado.`}
            confirmLabel="Tirar cortesia"
            onConfirm={() => definirCortesia(id, false)}
            onDone={() => router.refresh()}
            className="w-full py-2 text-center text-[15px] font-medium text-danger hover:underline sm:ml-auto sm:w-auto"
          >
            Tirar cortesia
          </ConfirmButton>
        )}
      </div>
    </div>
  );
}
