"use client";

import { useState } from "react";
import { Modal } from "@/components/modal";
import { useAction } from "@/components/use-action";
import { Field, btnGhost, btnPrimary, inputClass } from "@/components/ui";
import { IconPlus } from "@/components/icons";
import { criarLancamentoManual } from "./actions";

const CATEGORIAS_PADRAO = ["Aluguel", "Energia", "Internet", "Frete", "Embalagens", "Marketing", "Taxas", "Salários", "Retirada", "Aporte", "Outros"];

export function NovoLancamentoForm({ hoje, categorias }: { hoje: string; categorias: string[] }) {
  const [open, setOpen] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const { isPending, run } = useAction();
  const sugestoes = Array.from(new Set([...categorias, ...CATEGORIAS_PADRAO])).filter(
    (c) => c !== "Venda" && c !== "Fornecimento" && c !== "Estorno",
  );

  return (
    <>
      <button
        onClick={() => {
          setErro(null);
          setOpen(true);
        }}
        className={btnPrimary}
      >
        <IconPlus width={16} height={16} /> Novo lançamento
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Novo lançamento"
        description="Gastos, retiradas e receitas que não vieram de uma venda."
      >
        <form
          action={(formData) =>
            run(() => criarLancamentoManual(formData), { onSuccess: () => setOpen(false), onError: setErro })
          }
          className="flex flex-col gap-4"
        >
          <div className="grid grid-cols-2 gap-1 rounded-full bg-fill p-1" role="radiogroup" aria-label="Tipo">
            <label className="cursor-pointer rounded-full py-2 text-center text-[15px] font-medium text-ink-2 transition has-[:checked]:bg-surface has-[:checked]:font-semibold has-[:checked]:shadow-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/40 has-[:checked]:text-danger">
              <input type="radio" name="tipo" value="saida" defaultChecked className="sr-only" />
              Saída (gasto)
            </label>
            <label className="cursor-pointer rounded-full py-2 text-center text-[15px] font-medium text-ink-2 transition has-[:checked]:bg-surface has-[:checked]:font-semibold has-[:checked]:shadow-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/40 has-[:checked]:text-positive">
              <input type="radio" name="tipo" value="entrada" className="sr-only" />
              Entrada
            </label>
          </div>

          <Field label="Descrição *">
            <input name="descricao" required autoFocus className={inputClass} placeholder="Ex: Conta de luz de setembro" />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Valor (R$) *">
              <input name="valor" inputMode="decimal" required className={inputClass} placeholder="0,00" pattern="[0-9]+([.,][0-9]{1,2})?" />
            </Field>
            <Field label="Data">
              <input name="data" type="date" defaultValue={hoje} className={inputClass} />
            </Field>
          </div>

          <Field label="Categoria">
            <input name="categoria" list="categorias-caixa" defaultValue="Outros" className={inputClass} />
            <datalist id="categorias-caixa">
              {sugestoes.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>

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
              {isPending ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
