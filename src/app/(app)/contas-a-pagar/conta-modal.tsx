"use client";

import { RotuloAcao } from "@/components/rotulo-acao";
import { useState, type ReactNode } from "react";
import type { ActionResult } from "@/lib/action";
import { Modal } from "@/components/modal";
import { useAction } from "@/components/use-action";
import { Interruptor } from "@/components/ajustes";
import { Field, btnGhost, btnPrimary, inputClass } from "@/components/ui";
import { hojeISO } from "@/lib/format";

export interface ContaValores {
  descricao: string;
  valor: number;
  vencimento: string;
  recorrencia: string;
  categoria: string;
  fornecedor_id: string | null;
}

// Cadastro e edição de uma conta a pagar. Conta mensal repete sozinha: ao marcar como paga, a do
// mês seguinte já aparece na lista.
export function ContaModal({
  titulo,
  trigger,
  triggerClassName,
  triggerLabel,
  valores,
  fornecedores,
  onSave,
  successMessage,
}: {
  titulo: string;
  trigger: ReactNode;
  triggerClassName: string;
  triggerLabel?: string;
  valores?: ContaValores;
  fornecedores: { id: string; nome: string }[];
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
      <Modal open={open} onClose={() => setOpen(false)} title={titulo} size="sm" folha>
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
          <Field label="O que é *">
            <input
              name="descricao"
              required
              autoFocus
              maxLength={120}
              defaultValue={valores?.descricao}
              className={inputClass}
              placeholder="Aluguel, internet, boleto..."
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Valor (R$) *">
              <input
                name="valor"
                required
                inputMode="decimal"
                defaultValue={valores ? valores.valor.toFixed(2).replace(".", ",") : ""}
                className={inputClass}
                placeholder="0,00"
              />
            </Field>
            <Field label="Vencimento *">
              <input
                name="vencimento"
                type="date"
                required
                defaultValue={valores?.vencimento ?? hojeISO()}
                className={inputClass}
              />
            </Field>
          </div>
          <Field label="Categoria no caixa">
            <input
              name="categoria"
              maxLength={60}
              defaultValue={valores?.categoria ?? "Contas"}
              className={inputClass}
              placeholder="Contas"
            />
          </Field>
          {fornecedores.length > 0 && (
            <Field label="Fornecedor">
              <select name="fornecedor_id" defaultValue={valores?.fornecedor_id ?? ""} className={inputClass}>
                <option value="">Nenhum</option>
                {fornecedores.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nome}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Interruptor
            name="recorrencia"
            padrao={valores?.recorrencia === "mensal"}
            titulo="Repete todo mês"
            ajuda="Ao pagar, a conta do mês seguinte já fica na lista."
          />

          {erro && (
            <p role="alert" className="text-sm text-danger">
              {erro}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => setOpen(false)} className={btnGhost}>
              Cancelar
            </button>
            <button type="submit" disabled={isPending} className={btnPrimary}>
              <RotuloAcao pendente={isPending} ocupado="Salvando...">{"Salvar"}</RotuloAcao>
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
