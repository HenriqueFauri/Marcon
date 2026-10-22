"use client";

import { RotuloAcao } from "@/components/rotulo-acao";
import { useState } from "react";
import { useAction } from "@/components/use-action";
import { Modal } from "@/components/modal";
import { IconCheck } from "@/components/icons";
import { Field, btnPrimary, inputClass } from "@/components/ui";
import { formatBRL, hojeISO } from "@/lib/format";
import { receberParcela } from "./actions";

// "50", "50,5", "50.50" e "1.250,00" viram número; o resto vira NaN
function lerValor(texto: string) {
  const limpo = texto.trim();
  if (!limpo) return NaN;
  return Number(limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo);
}

function paraCampo(valor: number) {
  return valor.toFixed(2).replace(".", ",");
}

// Recebe a parcela inteira ou só uma parte: o que entrar vai para o caixa na data
// escolhida e o resto continua em aberto (função receber_parcela, migration 0045).
export function ReceberButton({
  id,
  valor,
  numero,
  cliente,
}: {
  id: string;
  valor: number;
  numero: number;
  cliente: string | null;
}) {
  const { isPending, run } = useAction();
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState("");
  const [data, setData] = useState("");

  const recebido = lerValor(texto);
  const valido = Number.isFinite(recebido) && recebido > 0 && recebido <= valor + 0.001;
  const falta = valido ? Math.max(valor - recebido, 0) : 0;

  function abrir() {
    setTexto(paraCampo(valor));
    setData(hojeISO());
    setAberto(true);
  }

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        className="inline-flex min-h-9 items-center gap-1 whitespace-nowrap rounded-full bg-brand-fill px-3.5 py-1.5 text-[13px] font-semibold text-on-brand transition active:scale-[0.98]"
      >
        <IconCheck width={14} height={14} />
        Receber
      </button>

      <Modal
        open={aberto}
        onClose={() => setAberto(false)}
        title="Receber parcela"
        description={`Parcela ${numero}${cliente ? " de " + cliente : ""}: ${formatBRL(valor)} em aberto`}
        size="sm"
        folha
      >
        <form
          className="flex flex-col gap-4 text-left"
          onSubmit={(e) => {
            e.preventDefault();
            if (!valido) return;
            run(() => receberParcela(id, recebido, data), { onSuccess: () => setAberto(false) });
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="Valor recebido (R$)">
              <input
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onFocus={(e) => e.target.select()}
                inputMode="decimal"
                required
                autoFocus
                placeholder="0,00"
                className={inputClass}
              />
            </Field>
            <Field label="Data">
              <input type="date" value={data} onChange={(e) => setData(e.target.value)} required className={inputClass} />
            </Field>
          </div>

          <p className={`text-[13px] ${valido ? "text-ink-muted" : "text-danger"}`} role="status">
            {!valido
              ? Number.isFinite(recebido) && recebido > valor
                ? `O máximo é ${formatBRL(valor)}, que é o que falta nessa parcela.`
                : "Digite quanto você recebeu."
              : falta > 0.004
                ? `Entra ${formatBRL(recebido)} no caixa. Continuam em aberto ${formatBRL(falta)}.`
                : `Entra ${formatBRL(recebido)} no caixa e a parcela fica paga.`}
          </p>

          <button type="submit" disabled={isPending || !valido} className={`${btnPrimary} w-full`}>
            <RotuloAcao pendente={isPending} ocupado="Salvando...">{falta > 0.004 ? "Receber parte" : "Receber tudo"}</RotuloAcao>
          </button>
        </form>
      </Modal>
    </>
  );
}
