"use client";

import { useState } from "react";
import { Modal } from "@/components/modal";
import { useAction } from "@/components/use-action";
import { Field, btnPrimary, inputClass } from "@/components/ui";
import { atualizarMetas } from "./metas-actions";

// As metas do mês são definidas direto no Início, onde os anéis aparecem.
export function MetasButton({ metaVendas, metaLucro }: { metaVendas: number | null; metaLucro: number | null }) {
  const [aberto, setAberto] = useState(false);
  const { isPending, run } = useAction();
  const temMeta = Boolean(metaVendas || metaLucro);

  return (
    <>
      <button type="button" onClick={() => setAberto(true)} className="self-start text-[13px] text-brand-text hover:underline">
        {temMeta ? "Editar metas" : "Definir metas do mês"}
      </button>
      <Modal
        open={aberto}
        onClose={() => setAberto(false)}
        title="Metas do mês"
        description="Os anéis mostram quanto falta. Deixe em branco pra não ter meta."
      >
        <form
          action={(formData) => run(() => atualizarMetas(formData), { onSuccess: () => setAberto(false) })}
          className="flex flex-col gap-4"
        >
          <Field label="Meta de vendas (R$)">
            <input name="meta_vendas" inputMode="decimal" defaultValue={metaVendas ?? ""} placeholder="Ex: 10000" className={inputClass} />
          </Field>
          <Field label="Meta de lucro (R$)">
            <input name="meta_lucro" inputMode="decimal" defaultValue={metaLucro ?? ""} placeholder="Ex: 4200" className={inputClass} />
          </Field>
          <button type="submit" disabled={isPending} className={`${btnPrimary} w-full`}>
            {isPending ? "Salvando..." : "Salvar metas"}
          </button>
        </form>
      </Modal>
    </>
  );
}
