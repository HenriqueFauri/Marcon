"use client";

import { ConfirmButton } from "@/components/confirm-button";
import { cancelarVenda } from "../actions";

export function CancelarVendaButton({ vendaId }: { vendaId: string }) {
  return (
    <ConfirmButton
      title="Cancelar esta venda?"
      description="Os itens voltam para o estoque, o que já foi recebido é estornado no fluxo de caixa e as parcelas em aberto são removidas. A venda continua no histórico marcada como cancelada."
      confirmLabel="Cancelar venda"
      onConfirm={() => cancelarVenda(vendaId)}
      className="inline-flex items-center rounded-full px-4 py-2 text-[15px] font-medium text-danger transition hover:bg-danger-tint"
      ariaLabel="Cancelar venda"
    >
      Cancelar venda
    </ConfirmButton>
  );
}
