"use client";

import { ConfirmButton } from "@/components/confirm-button";
import { btnSecondary } from "@/components/ui";
import { cancelarVenda } from "../actions";

export function CancelarVendaButton({ vendaId }: { vendaId: string }) {
  return (
    <ConfirmButton
      title="Cancelar esta venda?"
      description="Os itens voltam para o estoque, o que já foi recebido é estornado no fluxo de caixa e as parcelas em aberto são removidas. A venda continua no histórico marcada como cancelada."
      confirmLabel="Cancelar venda"
      onConfirm={() => cancelarVenda(vendaId)}
      className={`${btnSecondary} hover:border-red-500/50 hover:text-red-400`}
      ariaLabel="Cancelar venda"
    >
      Cancelar venda
    </ConfirmButton>
  );
}
