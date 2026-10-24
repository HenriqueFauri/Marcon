"use client";

import { RotuloAcao } from "@/components/rotulo-acao";
import { useState, useTransition, type ReactNode } from "react";
import { Modal } from "@/components/modal";
import { useToast } from "@/components/toaster";
import { btnDanger, btnGhost } from "@/components/ui";
import { mensagemDeErro, type ActionResult } from "@/lib/action";

type Sucesso = Extract<ActionResult, { ok: true }>;

// Janela de um item já pago (parcela recebida, conta paga): mostra os dados e, no fim, a ação de
// desfazer como texto vermelho discreto, com confirmação ali mesmo. Deu certo, o aviso ganha o
// "Desfazer" do app, que refaz o recebimento ou o pagamento.
export function JanelaDesfazer({
  trigger,
  triggerClassName,
  triggerLabel,
  titulo,
  descricao,
  linhas,
  extra,
  acao,
  confirmacao,
  bloqueio,
  onDesfazer,
  refazer,
}: {
  trigger: ReactNode;
  triggerClassName: string;
  triggerLabel?: string;
  titulo: string;
  descricao?: string;
  linhas: { rotulo: string; valor: ReactNode }[];
  extra?: ReactNode;
  acao: string;
  confirmacao: string;
  // quando não dá para desfazer, o motivo aparece no lugar da ação
  bloqueio?: string;
  onDesfazer: () => Promise<ActionResult>;
  refazer?: (resultado: Sucesso) => Promise<ActionResult>;
}) {
  const [aberto, setAberto] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [isPending, startTransition] = useTransition();
  const toast = useToast();

  function desfazer() {
    startTransition(async () => {
      try {
        const resultado = await onDesfazer();
        if (!resultado.ok) {
          toast.error(resultado.error);
          return;
        }
        setAberto(false);
        toast.success(
          resultado.message ?? "Pronto.",
          refazer
            ? {
                desfazer: () => {
                  refazer(resultado).then(
                    (r) => (r.ok ? toast.success(r.message ?? "Pronto.") : toast.error(r.error)),
                    (e: unknown) => toast.error(mensagemDeErro(e)),
                  );
                },
              }
            : undefined,
        );
      } catch (e) {
        toast.error(mensagemDeErro(e));
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setConfirmando(false);
          setAberto(true);
        }}
        className={triggerClassName}
        aria-label={triggerLabel}
        title={triggerLabel}
      >
        {trigger}
      </button>

      <Modal open={aberto} onClose={() => setAberto(false)} title={titulo} description={descricao} size="sm" folha>
        <dl className="divide-y divide-line">
          {linhas.map((l) => (
            <div key={l.rotulo} className="flex items-center justify-between gap-3 py-3 text-[17px]">
              <dt className="text-ink">{l.rotulo}</dt>
              <dd className="truncate tabular-nums text-ink-muted">{l.valor}</dd>
            </div>
          ))}
        </dl>

        {extra && <div className="mt-4">{extra}</div>}

        <div className="mt-5 border-t border-line pt-4 text-center">
          {bloqueio ? (
            <p className="text-[13px] text-ink-muted">{bloqueio}</p>
          ) : confirmando ? (
            <div className="flex flex-col gap-3 text-left">
              <p className="text-[13px] text-ink-muted" role="status">
                {confirmacao}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setConfirmando(false)} className={btnGhost}>
                  Cancelar
                </button>
                <button type="button" disabled={isPending} onClick={desfazer} className={btnDanger}>
                  <RotuloAcao pendente={isPending} ocupado="Aguarde...">
                    Desfazer
                  </RotuloAcao>
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmando(true)}
              className="text-[15px] font-medium text-danger hover:opacity-80"
            >
              {acao}
            </button>
          )}
        </div>
      </Modal>
    </>
  );
}
