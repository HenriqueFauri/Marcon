"use client";

import type { ReactNode } from "react";
import { formatBRL, formatData } from "@/lib/format";
import { JanelaDesfazer } from "../contas-a-receber/janela-desfazer";
import { desfazerPagamento, pagarConta } from "./actions";

// Toque numa conta paga: abre os dados do pagamento com "Desfazer pagamento" no fim.
// Desfazer devolve a saída ao caixa e a conta volta para em aberto (migration 0067);
// o "Desfazer" do aviso paga de novo na mesma data.
export function DesfazerPagamento({
  id,
  descricao,
  valor,
  dataPagamento,
  vencimento,
  mensal,
  fornecedor,
  trigger,
  triggerClassName,
}: {
  id: string;
  descricao: string;
  valor: number;
  dataPagamento: string | null;
  vencimento: string;
  mensal: boolean;
  fornecedor?: string | null;
  trigger: ReactNode;
  triggerClassName: string;
}) {
  const linhas = [
    { rotulo: "Valor", valor: formatBRL(valor) },
    ...(dataPagamento ? [{ rotulo: "Paga em", valor: formatData(dataPagamento) }] : []),
    { rotulo: "Vencimento", valor: formatData(vencimento) },
    ...(fornecedor ? [{ rotulo: "Fornecedor", valor: fornecedor }] : []),
    ...(mensal ? [{ rotulo: "Repete", valor: "Todo mês" }] : []),
  ];

  return (
    <JanelaDesfazer
      trigger={trigger}
      triggerClassName={triggerClassName}
      titulo={descricao}
      linhas={linhas}
      acao="Desfazer pagamento"
      confirmacao={
        mensal
          ? `Os ${formatBRL(valor)} voltam pro caixa e a conta fica em aberto de novo. A do mês seguinte sai da lista, se você ainda não mexeu nela.`
          : `Os ${formatBRL(valor)} voltam pro caixa e a conta fica em aberto de novo.`
      }
      onDesfazer={() => desfazerPagamento(id)}
      refazer={() => pagarConta(id, dataPagamento ?? "")}
    />
  );
}
