"use client";

import { RotuloAcao } from "@/components/rotulo-acao";
import { useState, type ReactNode } from "react";
import type { ActionResult } from "@/lib/action";
import type { ContatoValores } from "@/components/contato-modal";
import { ConfirmButton } from "@/components/confirm-button";
import { Modal } from "@/components/modal";
import { useAction } from "@/components/use-action";
import { Field, btnGhost, btnPrimary, inputClass } from "@/components/ui";

// Edição do fornecedor num modal, com o "Excluir fornecedor" no fim (padrão: destrutivo no fim,
// nunca lixeira na linha). Variação local do ContatoModal, que é compartilhado com Clientes.
export function EditarFornecedor({
  nome,
  valores,
  trigger,
  triggerClassName,
  onSave,
  onExcluir,
}: {
  nome: string;
  valores: ContatoValores;
  trigger: ReactNode;
  triggerClassName: string;
  onSave: (formData: FormData) => Promise<ActionResult>;
  onExcluir: () => Promise<ActionResult | void>;
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
        aria-label={`Editar ${nome}`}
      >
        {trigger}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Editar fornecedor">
        <form
          action={(formData) =>
            run(() => onSave(formData), {
              success: "Fornecedor atualizado.",
              onSuccess: () => setOpen(false),
              onError: setErro,
            })
          }
          className="flex flex-col gap-4"
        >
          <Field label="Nome *">
            <input name="nome" required autoFocus defaultValue={valores.nome} className={inputClass} placeholder="Nome completo" />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Telefone / WhatsApp">
              <input
                name="telefone"
                type="tel"
                inputMode="tel"
                defaultValue={valores.telefone ?? ""}
                className={inputClass}
                placeholder="(11) 99999-9999"
              />
            </Field>
            <Field label="E-mail">
              <input name="email" type="email" defaultValue={valores.email ?? ""} className={inputClass} />
            </Field>
          </div>
          <Field label="Observações">
            <textarea name="observacoes" rows={2} defaultValue={valores.observacoes ?? ""} className={inputClass} placeholder="Opcional" />
          </Field>

          {erro && (
            <p role="alert" className="text-[13px] text-danger">
              {erro}
            </p>
          )}

          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => setOpen(false)} className={btnGhost}>
              Cancelar
            </button>
            <button type="submit" disabled={isPending} className={`${btnPrimary} w-full sm:w-auto`}>
              <RotuloAcao pendente={isPending} ocupado="Salvando...">{"Salvar"}</RotuloAcao>
            </button>
          </div>
        </form>

        <div className="mt-5 border-t border-line pt-4 text-center">
          <ConfirmButton
            title={`Excluir “${nome}”?`}
            description="As compras já registradas com esse fornecedor continuam no histórico com o nome dele."
            successMessage="Fornecedor excluído."
            onConfirm={onExcluir}
            onDone={() => setOpen(false)}
            className="text-[15px] text-danger hover:opacity-80"
            ariaLabel={`Excluir ${nome}`}
          >
            Excluir fornecedor
          </ConfirmButton>
        </div>
      </Modal>
    </>
  );
}
