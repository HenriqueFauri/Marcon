"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAction } from "@/components/use-action";
import { rotuloDoAndamento, type AndamentoDoPedido } from "@/lib/vitrine";
import { Segmentado } from "../../campos";
import { mudarAndamentoDoPedido } from "../../actions";

// O cliente vê isto no link "Seu pedido" da loja.
export function AndamentoDoPedidoControle({
  id,
  andamento,
  entrega,
}: {
  id: string;
  andamento: AndamentoDoPedido;
  entrega: "entrega" | "retirada";
}) {
  const router = useRouter();
  const { isPending, run } = useAction();
  const [valor, setValor] = useState(andamento);

  return (
    <div className={isPending ? "pointer-events-none opacity-60" : undefined}>
      <Segmentado
        rotulo="Andamento do pedido"
        valor={valor}
        opcoes={(["recebido", "separado", "saiu"] as const).map((a) => ({ valor: a, label: rotuloDoAndamento(a, entrega) }))}
        onMudar={(novo) => {
          const antes = valor;
          setValor(novo);
          run(() => mudarAndamentoDoPedido(id, novo), {
            onSuccess: () => router.refresh(),
            onError: () => setValor(antes),
          });
        }}
      />
    </div>
  );
}
