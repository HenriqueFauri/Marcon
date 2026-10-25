"use client";

import { RotuloAcao } from "@/components/rotulo-acao";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/modal";
import { Interruptor } from "@/components/ajustes";
import { useAction } from "@/components/use-action";
import { btnDanger, btnGhost } from "@/components/ui";
import { IconTrash } from "@/components/icons";
import { excluirProduto } from "../actions";

export function ExcluirProdutoButton({ produtoId, nome }: { produtoId: string; nome: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [apagarHistorico, setApagarHistorico] = useState(false);
  const { isPending, run } = useAction();

  return (
    <>
      <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[15px] font-medium text-danger transition hover:bg-danger-tint">
        <IconTrash width={16} height={16} /> Excluir produto
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Excluir “${nome}”?`}
        description="O produto será apagado. As compras e lançamentos de caixa que ele já gerou são seus. Escolha o que fazer com eles."
        size="sm"
      >
        <div className="mb-4">
          <Interruptor
            name="apagar_historico"
            padrao={apagarHistorico}
            onMudar={setApagarHistorico}
            titulo="Apagar também o histórico"
            ajuda="Estoque e caixa deste produto. Desligado (recomendado), o dinheiro que ele já movimentou continua nos relatórios."
          />
        </div>

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
            <RotuloAcao pendente={isPending} ocupado="Excluindo...">{"Excluir produto"}</RotuloAcao>
          </button>
        </div>
      </Modal>
    </>
  );
}
