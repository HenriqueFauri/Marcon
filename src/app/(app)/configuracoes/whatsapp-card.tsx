"use client";

import { useState } from "react";
import { useAction } from "@/components/use-action";
import { ConfirmButton } from "@/components/confirm-button";
import { btnPrimary, btnSecondary } from "@/components/ui";
import { conferirVinculoWhatsapp, desvincularWhatsapp, gerarCodigoWhatsapp } from "./whatsapp-actions";

// número do WhatsApp do Marcon e prefixo do código: src/lib/whatsapp/vinculo.ts e WHATSAPP_NUMERO
export function WhatsappCard({
  vinculadoFinal,
  numeroDoMarcon,
  prefixo,
  podeLancar,
}: {
  vinculadoFinal: string | null; // últimos 4 dígitos do número vinculado
  numeroDoMarcon: string; // só dígitos
  prefixo: string;
  podeLancar: boolean; // conta liberada para lançar venda pelo WhatsApp
}) {
  const { isPending, run } = useAction();
  const [codigo, setCodigo] = useState<string | null>(null);

  const oQueFaz = podeLancar
    ? "Consulte estoque, preço, vendas e caixa, e lance vendas pelo Zap. Antes de lançar, ele sempre pede o seu SIM."
    : "Consulte estoque, preço, vendas e caixa pelo Zap.";

  if (vinculadoFinal) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-[15px] text-ink">
          Vinculado ao número com final <strong>{vinculadoFinal}</strong>.
        </p>
        <p className="text-[15px] text-ink-2">
          {oQueFaz} Mande &quot;ajuda&quot; para ver exemplos.
        </p>
        {/* destrutivo: discreto e no fim, como manda o padrão */}
        <ConfirmButton
          title="Desvincular o WhatsApp?"
          description="O assistente para de responder a este número. Dá para vincular de novo quando quiser."
          confirmLabel="Desvincular"
          onConfirm={() => desvincularWhatsapp()}
          className="self-start text-[15px] font-medium text-danger hover:underline"
          ariaLabel="Desvincular o WhatsApp"
        >
          Desvincular
        </ConfirmButton>
      </div>
    );
  }

  if (codigo) {
    const mensagem = `${prefixo}-${codigo}`;
    const link = `https://wa.me/${numeroDoMarcon}?text=${encodeURIComponent(mensagem)}`;
    return (
      <div className="flex flex-col gap-4">
        <p className="text-[15px] text-ink">Mande esta mensagem para o WhatsApp do Marcon. Vale por 15 minutos.</p>
        <p className="rounded-2xl bg-fill px-4 py-3 text-center text-[22px] font-semibold tracking-widest text-ink">{mensagem}</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <a href={link} target="_blank" rel="noopener noreferrer" className={`${btnPrimary} w-full sm:w-auto`}>
            Abrir o WhatsApp
          </a>
          <button
            type="button"
            disabled={isPending}
            className={`${btnSecondary} w-full sm:w-auto`}
            onClick={() => run(() => conferirVinculoWhatsapp())}
          >
            Já mandei
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[15px] text-ink">{oQueFaz}</p>
      <button
        type="button"
        disabled={isPending}
        className={`${btnPrimary} w-full sm:w-auto sm:self-start`}
        onClick={() =>
          run(async () => {
            const r = await gerarCodigoWhatsapp();
            if (r.ok && r.id) setCodigo(r.id);
            return r;
          })
        }
      >
        {isPending ? "Gerando..." : "Vincular meu WhatsApp"}
      </button>
    </div>
  );
}
