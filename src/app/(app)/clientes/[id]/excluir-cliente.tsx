"use client";

import { useRouter } from "next/navigation";
import { ConfirmButton } from "@/components/confirm-button";
import { excluirCliente } from "../actions";

// Excluir no fim da ficha, como texto vermelho; depois de excluir volta para a lista.
export function ExcluirCliente({ id, nome }: { id: string; nome: string }) {
  const router = useRouter();
  return (
    <ConfirmButton
      title={`Excluir “${nome}”?`}
      description="As vendas já feitas para esse cliente continuam no histórico com o nome registrado."
      ariaLabel={`Excluir ${nome}`}
      successMessage="Cliente excluído."
      onConfirm={() => excluirCliente(id)}
      onDone={() => router.replace("/clientes")}
      className="w-full px-4 py-3 text-left text-[17px] text-danger transition hover:bg-danger-tint active:bg-danger-tint"
    >
      Excluir cliente
    </ConfirmButton>
  );
}
