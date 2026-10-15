import Link from "next/link";
import type { Situacao } from "@/lib/assinatura";
import { formatData } from "@/lib/format";

// Aviso no topo do app para quem está com cortesia (plano Marcon dado pelo admin): nos 2 primeiros dias
// diz que a cortesia chegou; nos 3 últimos avisa que ela está acabando. No resto do tempo não aparece.
export function AvisoCortesia({ situacao }: { situacao: Situacao }) {
  if (situacao.tipo !== "cortesia" || !situacao.cortesiaAte) return null;

  const acabando = situacao.diasRestantes <= 3;
  if (!acabando && !situacao.cortesiaNova) return null;

  const ate = formatData(situacao.cortesiaAte);
  const texto = acabando
    ? situacao.diasRestantes === 1
      ? `Hoje é o último dia da sua cortesia (até ${ate}).`
      : `Sua cortesia termina em ${situacao.diasRestantes} dias (até ${ate}).`
    : `Você ganhou o plano Marcon: tudo liberado, sem cobrança, até ${ate}.`;

  return (
    <div className="hairline mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-3xl bg-surface px-4 py-3">
      <p className="min-w-0 flex-1 text-[15px] text-ink">{texto}</p>
      <Link href="/assinatura" className="shrink-0 text-[15px] font-medium text-brand-text hover:underline">
        {acabando ? "Assinar" : "Ver plano"}
      </Link>
    </div>
  );
}
