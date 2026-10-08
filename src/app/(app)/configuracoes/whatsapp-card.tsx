"use client";

import { useState } from "react";
import { useAction } from "@/components/use-action";
import { btnPrimary, btnSecondary } from "@/components/ui";
import { conferirVinculoWhatsapp, desvincularWhatsapp, gerarCodigoWhatsapp } from "./whatsapp-actions";

// números do WhatsApp do Marcon e texto do código ficam em src/lib/whatsapp/vinculo.ts
export function WhatsappCard({
  vinculadoFinal,
  numeroDoMarcon,
  prefixo,
}: {
  vinculadoFinal: string | null; // últimos 4 dígitos do número vinculado
  numeroDoMarcon: string; // só dígitos
  prefixo: string;
}) {
  const { isPending, run } = useAction();
  const [codigo, setCodigo] = useState<string | null>(null);

  if (vinculadoFinal) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-[15px] text-ink">
          Vinculado ao número com final <strong>{vinculadoFinal}</strong>. Mande uma pergunta para o WhatsApp do Marcon, como &quot;tem panela?&quot; ou &quot;quanto vendi hoje?&quot;.
        </p>
        <div>
          <button type="button" disabled={isPending} className={btnSecondary} onClick={() => run(() => desvincularWhatsapp())}>
            Desvincular
          </button>
        </div>
      </div>
    );
  }

  if (codigo) {
    const mensagem = `${prefixo}-${codigo}`;
    const link = `https://wa.me/${numeroDoMarcon}?text=${encodeURIComponent(mensagem)}`;
    return (
      <div className="flex flex-col gap-4">
        <p className="text-[15px] text-ink">
          Mande esta mensagem para o WhatsApp do Marcon. Vale por 15 minutos.
        </p>
        <p className="rounded-2xl bg-fill px-4 py-3 text-center text-[22px] font-semibold tracking-widest text-ink">{mensagem}</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <a href={link} target="_blank" rel="noopener noreferrer" className={`${btnPrimary} w-full sm:w-auto`}>
            Abrir o WhatsApp
          </a>
          <button type="button" disabled={isPending} className={`${btnSecondary} w-full sm:w-auto`} onClick={() => run(() => conferirVinculoWhatsapp())}>
            Já mandei
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[15px] text-ink">
        Consulte estoque, preço e vendas pelo WhatsApp. Ainda em teste.
      </p>
      <div>
        <button
          type="button"
          disabled={isPending}
          className={btnPrimary}
          onClick={() =>
            run(async () => {
              const r = await gerarCodigoWhatsapp();
              if (r.ok && r.id) setCodigo(r.id);
              return r;
            })
          }
        >
          {isPending ? "Gerando..." : "Gerar código"}
        </button>
      </div>
    </div>
  );
}
