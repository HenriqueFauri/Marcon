import Link from "next/link";
import type { Situacao } from "@/lib/assinatura";
import { formatData } from "@/lib/format";
import { PLANO_GRATIS } from "@/lib/planos";
import { btnSmall } from "./ui";

// Aviso no topo do app quando o plano está para mudar ou acabou de mudar, para o fim do teste ou da
// cortesia não pegar ninguém de surpresa (o push sozinho não bastou):
//  * teste e cortesia com prazo: nos 3 últimos dias, conta quantos faltam e diz o que muda;
//  * no dia em que a conta vira grátis: diz que virou e o que mudou;
//  * cortesia que acabou de chegar: nos 2 primeiros dias, avisa que chegou.
// No resto do tempo não aparece. Só exibe: limites e regra de cobrança moram no banco.
export function AvisoPlano({ situacao, vitrineNoAr }: { situacao: Situacao; vitrineNoAr: boolean }) {
  const aviso = textoDoAviso(situacao, vitrineNoAr);
  if (!aviso) return null;

  return (
    <div className="hairline mb-5 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-3xl bg-surface px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-medium text-ink">{aviso.titulo}</p>
        {aviso.detalhe && <p className="mt-0.5 text-[13px] text-ink-muted">{aviso.detalhe}</p>}
      </div>
      <Link
        href="/assinatura"
        className={
          aviso.acao === "Assinar"
            ? `${btnSmall} shrink-0 bg-brand-fill text-on-brand`
            : "shrink-0 text-[15px] font-medium text-brand-text hover:underline"
        }
      >
        {aviso.acao}
      </Link>
    </div>
  );
}

// o que o grátis muda, em linguagem simples (números de PLANO_GRATIS, os mesmos da tela de planos)
function oQueMuda(vitrineNoAr: boolean, jaMudou: boolean) {
  const { vendasPorMes, produtos } = PLANO_GRATIS.limites;
  const limites = `até ${vendasPorMes} vendas por mês e ${produtos} produtos`;
  const vitrine = vitrineNoAr ? (jaMudou ? ", e sua vitrine saiu do ar pros clientes" : ", e sua vitrine sai do ar pros clientes") : "";
  return `${limites}${vitrine}. Seus dados continuam aqui.`;
}

function textoDoAviso(s: Situacao, vitrineNoAr: boolean) {
  if (s.tipo === "teste" && s.diasRestantes <= 3) {
    return {
      titulo: s.diasRestantes <= 1 ? "Hoje é o último dia do seu teste." : `Seu teste termina em ${s.diasRestantes} dias.`,
      detalhe: `Depois a conta fica grátis: ${oQueMuda(vitrineNoAr, false)}`,
      acao: "Assinar",
    };
  }

  if (s.tipo === "gratis" && s.virouGratisHoje) {
    return {
      titulo: s.virouGratisHoje === "teste" ? "Seu teste acabou." : "Sua cortesia acabou.",
      detalhe: `A conta agora é grátis: ${oQueMuda(vitrineNoAr, true)}`,
      acao: "Assinar",
    };
  }

  if (s.tipo === "cortesia" && s.cortesiaAte) {
    const ate = formatData(s.cortesiaAte);
    if (s.diasRestantes <= 3) {
      return {
        titulo:
          s.diasRestantes <= 1
            ? `Hoje é o último dia da sua cortesia (até ${ate}).`
            : `Sua cortesia termina em ${s.diasRestantes} dias (até ${ate}).`,
        detalhe: `Depois a conta fica grátis: ${oQueMuda(vitrineNoAr, false)}`,
        acao: "Assinar",
      };
    }
    if (s.cortesiaNova) {
      return { titulo: `Você ganhou o plano Marcon: tudo liberado, sem cobrança, até ${ate}.`, detalhe: null, acao: "Ver plano" };
    }
  }

  return null;
}
