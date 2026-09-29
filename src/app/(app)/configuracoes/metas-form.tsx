"use client";

import { useAction } from "@/components/use-action";
import { Field, btnPrimary, inputClass } from "@/components/ui";
import { atualizarMetas } from "./actions";

export function MetasForm({ metaVendas, metaLucro }: { metaVendas: number | null; metaLucro: number | null }) {
  const { isPending, run } = useAction();
  return (
    <form action={(formData) => run(() => atualizarMetas(formData))} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Meta de vendas do mês (R$)">
          <input
            name="meta_vendas"
            inputMode="decimal"
            defaultValue={metaVendas ?? ""}
            placeholder="Ex: 10000"
            className={inputClass}
          />
        </Field>
        <Field label="Meta de lucro do mês (R$)">
          <input
            name="meta_lucro"
            inputMode="decimal"
            defaultValue={metaLucro ?? ""}
            placeholder="Ex: 4200"
            className={inputClass}
          />
        </Field>
      </div>
      <div>
        <button type="submit" disabled={isPending} className={btnPrimary}>
          {isPending ? "Salvando..." : "Salvar metas"}
        </button>
      </div>
    </form>
  );
}
