"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { btnSecondary } from "@/components/ui";
import { formatBRL, formatData } from "@/lib/format";
import { desfazerRecebimento, receberParcela } from "./actions";
import { JanelaDesfazer } from "./janela-desfazer";

// Toque numa parcela recebida: abre os dados do recebimento com "Desfazer recebimento" no fim.
// Desfazer tira a entrada do caixa e devolve o valor para o que está em aberto (migration 0067);
// o "Desfazer" do aviso recebe de novo, com o mesmo valor e a mesma data.
export function DesfazerRecebimento({
  id,
  valor,
  numero,
  cliente,
  dataPagamento,
  vencimento,
  parcial,
  entrada,
  cancelada,
  vendaHref,
  trigger,
  triggerClassName,
  triggerLabel,
}: {
  id: string;
  valor: number;
  numero: number;
  cliente: string | null;
  dataPagamento: string | null;
  vencimento: string;
  parcial: boolean;
  entrada?: boolean;
  cancelada?: boolean;
  vendaHref?: string;
  trigger: ReactNode;
  triggerClassName: string;
  triggerLabel?: string;
}) {
  const linhas = [
    { rotulo: parcial ? "Parte recebida" : "Recebido", valor: formatBRL(valor) },
    ...(dataPagamento ? [{ rotulo: "Recebido em", valor: formatData(dataPagamento) }] : []),
    { rotulo: "Vencimento", valor: formatData(vencimento) },
  ];

  return (
    <JanelaDesfazer
      trigger={trigger}
      triggerClassName={triggerClassName}
      triggerLabel={triggerLabel}
      titulo={`Parcela ${numero}${entrada ? ": entrada" : ""}`}
      descricao={cliente ?? undefined}
      linhas={linhas}
      extra={
        vendaHref ? (
          <Link href={vendaHref} className={`${btnSecondary} w-full`}>
            Ver venda
          </Link>
        ) : undefined
      }
      acao="Desfazer recebimento"
      confirmacao={`Os ${formatBRL(valor)} saem do caixa e voltam a ficar em aberto na parcela ${numero}.`}
      bloqueio={
        cancelada
          ? "Essa venda foi cancelada e o que entrou já foi estornado."
          : entrada
            ? "A entrada foi paga na hora da venda. Pra mudar, use Editar venda."
            : undefined
      }
      onDesfazer={() => desfazerRecebimento(id)}
      refazer={(r) => receberParcela(r.id ?? id, valor, dataPagamento ?? undefined)}
    />
  );
}
