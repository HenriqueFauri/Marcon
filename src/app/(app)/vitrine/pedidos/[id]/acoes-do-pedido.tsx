"use client";

import { useRouter } from "next/navigation";
import { useAction } from "@/components/use-action";
import { mudarStatusDoPedido } from "../../actions";

// ação destrutiva no fim da tela, como texto vermelho discreto (docs/DESIGN.md)
export function AcaoDeStatus({ id, status }: { id: string; status: "novo" | "descartado" }) {
  const router = useRouter();
  const { isPending, run } = useAction();
  const descartar = status === "novo";
  return (
    <button
      type="button"
      disabled={isPending}
      // depois de descartar ou reabrir, volta para a lista de novos
      onClick={() =>
        run(() => mudarStatusDoPedido(id, descartar ? "descartado" : "novo"), {
          onSuccess: () => router.push("/vitrine/pedidos?status=novo"),
        })
      }
      className={`self-center px-4 py-2 text-[15px] font-medium disabled:opacity-50 ${descartar ? "text-danger" : "text-brand-text"}`}
    >
      {descartar ? "Descartar pedido" : "Voltar para os novos"}
    </button>
  );
}
