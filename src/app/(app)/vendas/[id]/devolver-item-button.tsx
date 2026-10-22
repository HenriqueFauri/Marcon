"use client";

import { useState } from "react";
import { useAction } from "@/components/use-action";
import { Modal } from "@/components/modal";
import { Field, btnGhost, btnPrimary, inputClass } from "@/components/ui";
import { formatBRL } from "@/lib/format";
import { devolverItemVenda } from "../actions";

// Devolve parte ou toda a quantidade de um item (função devolver_item_venda, migration 0052).
// Troca: devolva o item e lance uma nova venda com o que o cliente levou no lugar.
export function DevolverItemButton({
  vendaId,
  itemId,
  nome,
  quantidade,
  precoUnitario,
  unidadesNaVenda,
}: {
  vendaId: string;
  itemId: string;
  nome: string;
  quantidade: number;
  precoUnitario: number;
  // total de unidades da venda: devolver tudo é cancelar, então sempre sobra pelo menos uma
  unidadesNaVenda: number;
}) {
  const { isPending, run } = useAction();
  const [aberto, setAberto] = useState(false);
  const [qtd, setQtd] = useState(1);
  const [voltar, setVoltar] = useState(true);

  const max = Math.min(quantidade, unidadesNaVenda - 1);
  const valido = Number.isInteger(qtd) && qtd >= 1 && qtd <= max;

  if (max < 1) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setQtd(1);
          setVoltar(true);
          setAberto(true);
        }}
        className="shrink-0 text-[13px] font-medium text-brand-text"
      >
        Devolver
      </button>
      <Modal
        open={aberto}
        onClose={() => setAberto(false)}
        title="Devolver item"
        description={`${nome}: ${quantidade} ${quantidade === 1 ? "unidade" : "unidades"} de ${formatBRL(precoUnitario)}`}
        size="sm"
        folha
      >
        <form
          className="flex flex-col gap-4 text-left"
          onSubmit={(e) => {
            e.preventDefault();
            if (!valido) return;
            run(() => devolverItemVenda(vendaId, itemId, qtd, voltar), { onSuccess: () => setAberto(false) });
          }}
        >
          <Field label="Quantidade devolvida" hint="O valor devolvido é proporcional, já com o desconto da venda.">
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={max}
              value={qtd}
              onChange={(e) => setQtd(Number(e.target.value))}
              onFocus={(e) => e.target.select()}
              className={inputClass}
              autoFocus
            />
          </Field>
          <label className="flex items-center gap-3 text-[15px] text-ink">
            <input type="checkbox" checked={voltar} onChange={(e) => setVoltar(e.target.checked)} className="h-5 w-5" />
            Voltar pro estoque
          </label>
          <p className="text-[13px] text-ink-muted">
            O valor sai das parcelas em aberto e, se já foi pago, volta como estorno no caixa. Pra trocar, devolva e lance
            uma venda nova.
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setAberto(false)} className={btnGhost}>
              Voltar
            </button>
            <button type="submit" disabled={!valido || isPending} className={btnPrimary}>
              {isPending ? "Devolvendo..." : "Devolver"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
