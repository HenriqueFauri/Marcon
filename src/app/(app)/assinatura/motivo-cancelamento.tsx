"use client";

import { useState } from "react";
import { Grupo } from "@/components/ajustes";
import { IconCheck } from "@/components/icons";
import { RotuloAcao } from "@/components/rotulo-acao";
import { useAction } from "@/components/use-action";
import { btnGhost, btnSecondary, inputClass } from "@/components/ui";
import { COMENTARIO_MAXIMO, MOTIVOS_CANCELAMENTO, type MotivoCancelamento } from "@/lib/cancelamento";
import { registrarMotivoCancelamento } from "./actions";

// aparece só depois que o cancelamento deu certo: é opcional e não segura ninguém
export function PerguntaDoCancelamento({ aoFechar }: { aoFechar: () => void }) {
  const [motivo, setMotivo] = useState<MotivoCancelamento | null>(null);
  const [comentario, setComentario] = useState("");
  const { isPending, run } = useAction();

  return (
    <Grupo titulo="Por que você cancelou?" rodape="Responder é opcional. Seu cancelamento já está feito.">
      <div role="radiogroup" aria-label="Motivo do cancelamento" className="-mx-4 -mt-4 divide-y divide-line sm:-mx-5 sm:-mt-5">
        {MOTIVOS_CANCELAMENTO.map((m) => (
          <label
            key={m.valor}
            className="flex min-h-11 cursor-pointer items-center justify-between gap-3 px-4 py-3 text-[17px] text-ink has-[:focus-visible]:bg-fill sm:px-5"
          >
            <input
              type="radio"
              name="motivo-cancelamento"
              value={m.valor}
              checked={motivo === m.valor}
              onChange={() => setMotivo(m.valor)}
              className="sr-only"
            />
            <span className="min-w-0">{m.label}</span>
            <IconCheck width={18} height={18} className={`shrink-0 text-brand-text ${motivo === m.valor ? "" : "invisible"}`} />
          </label>
        ))}
      </div>
      <div>
        <label htmlFor="comentario-cancelamento" className="mb-1.5 block text-[13px] font-medium text-ink-muted">
          Quer contar mais? (opcional)
        </label>
        <textarea
          id="comentario-cancelamento"
          className={inputClass}
          rows={3}
          maxLength={COMENTARIO_MAXIMO}
          value={comentario}
          onChange={(e) => setComentario(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          className={btnSecondary}
          disabled={!motivo || isPending}
          onClick={() => {
            if (motivo) run(() => registrarMotivoCancelamento(motivo, comentario), { onSuccess: aoFechar });
          }}
        >
          <RotuloAcao pendente={isPending} ocupado="Enviando...">
            Enviar resposta
          </RotuloAcao>
        </button>
        <button type="button" className={btnGhost} onClick={aoFechar}>
          Agora não
        </button>
      </div>
    </Grupo>
  );
}
