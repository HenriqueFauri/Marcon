"use client";

import { useState, type ReactNode } from "react";
import type { ActionResult } from "@/lib/action";
import { Modal } from "./modal";
import { useAction } from "./use-action";
import { Field, btnGhost, btnPrimary, inputClass } from "./ui";

export interface ContatoValores {
  nome: string;
  telefone: string | null;
  email: string | null;
  cpf_cnpj?: string | null;
  observacoes: string | null;
}

// Formulário de cadastro/edição de cliente ou fornecedor, num modal.
export function ContatoModal({
  titulo,
  trigger,
  triggerClassName,
  triggerLabel,
  valores,
  comDocumento = false,
  onSave,
  successMessage,
}: {
  titulo: string;
  trigger: ReactNode;
  triggerClassName: string;
  triggerLabel?: string;
  valores?: ContatoValores;
  comDocumento?: boolean;
  onSave: (formData: FormData) => Promise<ActionResult>;
  successMessage: string;
}) {
  const [open, setOpen] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const { isPending, run } = useAction();

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setErro(null);
          setOpen(true);
        }}
        className={triggerClassName}
        aria-label={triggerLabel}
        title={triggerLabel}
      >
        {trigger}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={titulo}>
        <form
          action={(formData) =>
            run(() => onSave(formData), {
              success: successMessage,
              onSuccess: () => setOpen(false),
              onError: setErro,
            })
          }
          className="flex flex-col gap-4"
        >
          <Field label="Nome *">
            <input name="nome" required autoFocus defaultValue={valores?.nome} className={inputClass} placeholder="Nome completo" />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Telefone / WhatsApp">
              <input
                name="telefone"
                type="tel"
                inputMode="tel"
                defaultValue={valores?.telefone ?? ""}
                className={inputClass}
                placeholder="(11) 99999-9999"
              />
            </Field>
            <Field label="E-mail">
              <input name="email" type="email" defaultValue={valores?.email ?? ""} className={inputClass} />
            </Field>
          </div>
          {comDocumento && (
            <Field label="CPF/CNPJ">
              <input name="cpf_cnpj" defaultValue={valores?.cpf_cnpj ?? ""} className={inputClass} placeholder="Opcional" />
            </Field>
          )}
          <Field label="Observações">
            <textarea name="observacoes" rows={2} defaultValue={valores?.observacoes ?? ""} className={inputClass} placeholder="Opcional" />
          </Field>

          {erro && (
            <p role="alert" className="text-sm text-red-400">
              {erro}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => setOpen(false)} className={btnGhost}>
              Cancelar
            </button>
            <button type="submit" disabled={isPending} className={btnPrimary}>
              {isPending ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
