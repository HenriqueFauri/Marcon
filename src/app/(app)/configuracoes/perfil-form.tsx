"use client";

import { useAction } from "@/components/use-action";
import { Field, btnPrimary, inputClass } from "@/components/ui";
import { atualizarPerfil } from "./actions";

export function PerfilForm({ nome, email }: { nome: string; email: string }) {
  const { isPending, run } = useAction();

  return (
    <form action={(formData) => run(() => atualizarPerfil(formData))} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Seu nome">
          <input name="nome" defaultValue={nome} required className={inputClass} autoComplete="name" />
        </Field>
        <Field label="E-mail da conta">
          <input value={email} disabled readOnly className={inputClass} />
        </Field>
      </div>
      <div>
        <button type="submit" disabled={isPending} className={btnPrimary}>
          {isPending ? "Salvando..." : "Salvar"}
        </button>
      </div>
    </form>
  );
}
