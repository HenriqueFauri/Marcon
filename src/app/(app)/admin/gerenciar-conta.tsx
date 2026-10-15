"use client";

import { useState } from "react";
import Link from "next/link";
import { Modal } from "@/components/modal";
import { Grupo, LinhaInfo } from "@/components/ajustes";
import { IconEllipsis } from "@/components/icons";
import { AcoesConta } from "./acoes-conta";
import { AssistenteDaConta } from "./assistente-da-conta";
import { CortesiaDaConta } from "./cortesia-da-conta";

// O que o admin muda numa conta, já montado no servidor (datas formatadas, rodapés prontos).
export interface ContaGerenciavel {
  id: string;
  email: string;
  titulo: string;
  pagante: boolean;
  cortesia: { ativa: boolean; valeAte: string | null; motivo: string | null; dadaEm: string | null };
  assistente: { admin: boolean; usar: boolean; lancar: boolean; rodape: string };
  podeBloquear: boolean;
  bloqueada: boolean;
}

// Cortesia e assistente. Usado no topo da página da conta e na folha de ações da lista.
export function GerenciarConta({ conta }: { conta: ContaGerenciavel }) {
  const { cortesia, assistente } = conta;
  return (
    <>
      <Grupo
        titulo="Cortesia"
        semPadding
        rodape={
          conta.pagante
            ? "Essa conta paga pelo Asaas. Para dar cortesia, cancele a assinatura dela antes."
            : "O prazo conta o dia de hoje. O cliente é avisado na hora e 3 dias antes de acabar."
        }
      >
        {cortesia.ativa && (
          <>
            <LinhaInfo rotulo="Vale até" valor={cortesia.valeAte ?? "Sem prazo (antiga)"} />
            <LinhaInfo rotulo="Motivo" valor={cortesia.motivo ?? "Sem motivo"} />
            {cortesia.dadaEm && <LinhaInfo rotulo="Dada em" valor={cortesia.dadaEm} />}
          </>
        )}
        {conta.pagante ? (
          <LinhaInfo rotulo="Plano" valor="Pago" />
        ) : (
          <div className="border-t border-line px-4 py-3 first:border-t-0">
            <CortesiaDaConta id={conta.id} email={conta.email} ativa={cortesia.ativa} />
          </div>
        )}
      </Grupo>

      <Grupo titulo="Assistente no WhatsApp" semPadding rodape={assistente.rodape}>
        {assistente.admin ? (
          <LinhaInfo rotulo="Liberado" valor="Tudo, por ser admin" />
        ) : (
          <AssistenteDaConta id={conta.id} usar={assistente.usar} lancar={assistente.lancar} />
        )}
      </Grupo>
    </>
  );
}

// Botão "⋯" de cada linha do /admin: abre a folha com as ações da conta, sem sair da lista.
export function AcoesRapidas({ conta }: { conta: ContaGerenciavel }) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label={`Ações de ${conta.titulo}`}
        onClick={() => setAberto(true)}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-muted transition hover:bg-fill hover:text-ink active:bg-fill-strong"
      >
        <IconEllipsis width={20} height={20} />
      </button>
      <Modal open={aberto} onClose={() => setAberto(false)} title={conta.titulo} description={conta.email} folha>
        <div className="flex flex-col gap-6">
          <GerenciarConta conta={conta} />
          <div className="flex flex-wrap items-center justify-between gap-3 px-4">
            <Link href={`/admin/contas/${conta.id}`} className="py-1 text-[15px] font-medium text-brand-text hover:underline">
              Ver vendas e produtos
            </Link>
            {conta.podeBloquear && <AcoesConta id={conta.id} email={conta.email} bloqueada={conta.bloqueada} />}
          </div>
        </div>
      </Modal>
    </>
  );
}
