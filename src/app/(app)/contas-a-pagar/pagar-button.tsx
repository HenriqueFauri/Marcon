"use client";

import { RotuloAcao } from "@/components/rotulo-acao";
import { useState } from "react";
import { useAction } from "@/components/use-action";
import { Modal } from "@/components/modal";
import { IconCheck } from "@/components/icons";
import { Field, btnPrimary, btnSmall, inputClass } from "@/components/ui";
import { formatBRL, hojeISO } from "@/lib/format";
import { pagarConta } from "./actions";

// Marca a conta como paga: a saída entra no caixa na data escolhida.
export function PagarButton({ id, descricao, valor, mensal }: { id: string; descricao: string; valor: number; mensal: boolean }) {
  const { isPending, run } = useAction();
  const [aberto, setAberto] = useState(false);
  const [data, setData] = useState("");

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setData(hojeISO());
          setAberto(true);
        }}
        className={`${btnSmall} min-h-9 bg-brand-fill text-on-brand`}
      >
        <IconCheck width={14} height={14} />
        Pagar
      </button>

      <Modal
        open={aberto}
        onClose={() => setAberto(false)}
        title="Marcar como paga"
        description={`${descricao}: ${formatBRL(valor)}`}
        size="sm"
        folha
      >
        <form
          className="flex flex-col gap-4 text-left"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => pagarConta(id, data), { onSuccess: () => setAberto(false) });
          }}
        >
          <Field label="Data do pagamento">
            <input type="date" value={data} onChange={(e) => setData(e.target.value)} required className={inputClass} />
          </Field>
          <p className="text-[13px] text-ink-muted" role="status">
            {mensal
              ? `Sai ${formatBRL(valor)} do caixa e a conta do mês que vem já entra na lista.`
              : `Sai ${formatBRL(valor)} do caixa.`}
          </p>
          <button type="submit" disabled={isPending} className={`${btnPrimary} w-full`}>
            <RotuloAcao pendente={isPending} ocupado="Salvando...">{"Confirmar pagamento"}</RotuloAcao>
          </button>
        </form>
      </Modal>
    </>
  );
}
