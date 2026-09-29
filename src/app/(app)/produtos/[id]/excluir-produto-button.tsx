"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/modal";
import { useAction } from "@/components/use-action";
import { btnDanger, btnGhost, btnSecondary } from "@/components/ui";
import { IconTrash } from "@/components/icons";
import { excluirProduto } from "../actions";

export function ExcluirProdutoButton({ produtoId, nome }: { produtoId: string; nome: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [apagarHistorico, setApagarHistorico] = useState(false);
  const { isPending, run } = useAction();

  return (
    <>
      <button onClick={() => setOpen(true)} className={`${btnSecondary} hover:border-red-500/50 hover:text-red-400`}>
        <IconTrash width={16} height={16} /> Excluir
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Excluir “${nome}”?`}
        description="O produto será apagado. As compras e lançamentos de caixa que ele já gerou são seus — escolha o que fazer com eles."
        size="sm"
      >
        <label className="mb-4 flex items-start gap-3 rounded-lg border border-neutral-800 p-3 text-sm text-neutral-300">
          <input
            type="checkbox"
            checked={apagarHistorico}
            onChange={(e) => setApagarHistorico(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-red-500"
          />
          <span>
            Apagar também o histórico de estoque e os lançamentos de caixa deste produto
            <span className="mt-1 block text-xs text-neutral-500">
              Desmarcado (recomendado): o produto some, mas o dinheiro que ele já movimentou continua nos seus relatórios.
            </span>
          </span>
        </label>

        <div className="flex justify-end gap-2">
          <button onClick={() => setOpen(false)} className={btnGhost}>
            Cancelar
          </button>
          <button
            disabled={isPending}
            onClick={() =>
              run(() => excluirProduto(produtoId, apagarHistorico), {
                onSuccess: () => {
                  setOpen(false);
                  router.push("/produtos");
                },
              })
            }
            className={btnDanger}
          >
            {isPending ? "Excluindo..." : "Excluir produto"}
          </button>
        </div>
      </Modal>
    </>
  );
}
