"use client";

import { useRouter } from "next/navigation";
import { useAction } from "@/components/use-action";
import { Interruptor } from "@/components/ajustes";
import { definirAssistente, type NivelAssistente } from "./actions";

// Interruptores do assistente no WhatsApp na página da conta, no /admin. Lançar depende de usar.
export function AssistenteDaConta({ id, usar, lancar }: { id: string; usar: boolean; lancar: boolean }) {
  const router = useRouter();
  const { isPending, run } = useAction();
  const mudar = (nivel: NivelAssistente) => run(() => definirAssistente(id, nivel), { onSuccess: () => router.refresh() });

  // a chave remonta os interruptores quando os dados voltam do servidor
  return (
    <div key={`${usar}-${lancar}`}>
      <div className="px-4 py-3">
        <Interruptor
          name="assistente_usar"
          padrao={usar}
          titulo="Usar o assistente"
          ajuda="Vê o assistente em Configurações, vincula o número e pergunta pelo WhatsApp."
          desabilitado={isPending}
          onMudar={(v) => mudar(v ? (lancar ? "lancar" : "usar") : "nenhum")}
        />
      </div>
      <div className="border-t border-line px-4 py-3">
        <Interruptor
          name="assistente_lancar"
          padrao={usar && lancar}
          titulo="Lançar pelo WhatsApp"
          ajuda="Venda, produto, estoque e caixa, sempre mostrando o resumo antes."
          desabilitado={isPending || !usar}
          onMudar={(v) => mudar(v ? "lancar" : "usar")}
        />
      </div>
    </div>
  );
}
