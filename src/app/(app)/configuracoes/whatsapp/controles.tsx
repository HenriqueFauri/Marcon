"use client";

import { useState } from "react";
import { useAction } from "@/components/use-action";
import { ConfirmButton } from "@/components/confirm-button";
import { Interruptor } from "@/components/ajustes";
import { btnPrimary, btnSecondary } from "@/components/ui";
import {
  alterarLancarVenda,
  apagarConversaWhatsapp,
  conferirVinculoWhatsapp,
  desvincularWhatsapp,
  gerarCodigoWhatsapp,
} from "../whatsapp-actions";

// mesma aparência das linhas do grupo (LinhaLink), para ações que abrem confirmação
const linha = "flex w-full items-center border-t border-line px-4 py-3 text-left text-[17px] transition first:border-t-0 hover:bg-fill/60 active:bg-fill";

export function Vincular({ numeroDoMarcon, prefixo }: { numeroDoMarcon: string; prefixo: string }) {
  const { isPending, run } = useAction();
  const [codigo, setCodigo] = useState<string | null>(null);

  if (codigo) {
    const mensagem = `${prefixo}-${codigo}`;
    const link = `https://wa.me/${numeroDoMarcon}?text=${encodeURIComponent(mensagem)}`;
    return (
      <>
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
      </>
    );
  }

  return (
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
  );
}

export function InterruptorVenda({ ligado }: { ligado: boolean }) {
  const { isPending, run } = useAction();
  return (
    <div className="px-4 py-3">
      <Interruptor
        name="lancar_venda"
        padrao={ligado}
        titulo="Lançar vendas por aqui"
        ajuda="Antes de lançar, o assistente sempre pede o seu SIM."
        desabilitado={isPending}
        onMudar={(v) => run(() => alterarLancarVenda(v))}
      />
    </div>
  );
}

export function ApagarConversa() {
  return (
    <ConfirmButton
      title="Apagar a conversa?"
      description="O assistente esquece o que vocês conversaram e começa do zero. Suas vendas e dados do Marcon não mudam."
      confirmLabel="Apagar"
      onConfirm={() => apagarConversaWhatsapp()}
      className={`${linha} text-ink`}
      ariaLabel="Apagar a conversa"
    >
      Apagar a conversa
    </ConfirmButton>
  );
}

export function Desvincular() {
  return (
    <ConfirmButton
      title="Desvincular o WhatsApp?"
      description="O assistente para de responder a este número e a conversa guardada é apagada. Dá para vincular de novo quando quiser."
      confirmLabel="Desvincular"
      onConfirm={() => desvincularWhatsapp()}
      className={`${linha} text-danger`}
      ariaLabel="Desvincular o WhatsApp"
    >
      Desvincular
    </ConfirmButton>
  );
}
