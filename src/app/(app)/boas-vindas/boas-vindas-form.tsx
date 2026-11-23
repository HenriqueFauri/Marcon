"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Grupo } from "@/components/ajustes";
import { RotuloAcao } from "@/components/rotulo-acao";
import { useAction } from "@/components/use-action";
import { Field, btnGhost, btnPrimary, inputClass } from "@/components/ui";
import { salvarNomeDoNegocio } from "./actions";

export function BoasVindasForm({ nomeNegocio }: { nomeNegocio: string }) {
  const router = useRouter();
  const { isPending, run } = useAction();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    run(() => salvarNomeDoNegocio(formData), { onSuccess: () => router.push("/produtos/novo") });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-7">
      <Grupo titulo="Seu negócio" rodape="Aparece no recibo e na vitrine. Dá pra mudar depois em Configurações.">
        <Field label="Nome do negócio">
          <input
            name="nome_negocio"
            type="text"
            required
            maxLength={80}
            autoComplete="organization"
            autoFocus
            defaultValue={nomeNegocio}
            className={inputClass}
            placeholder="Desapegos da Yasmin"
          />
        </Field>
      </Grupo>

      <div className="flex flex-col gap-2">
        <button type="submit" disabled={isPending} className={`${btnPrimary} w-full py-3`}>
          <RotuloAcao pendente={isPending} ocupado="Salvando...">
            Cadastrar o primeiro produto
          </RotuloAcao>
        </button>
        <Link href="/" className={`${btnGhost} w-full`}>
          Agora não
        </Link>
      </div>
    </form>
  );
}
