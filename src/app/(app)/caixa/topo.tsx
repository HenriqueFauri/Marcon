import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import { formatBRL, hojeISO } from "@/lib/format";
import { PageHeader, Segmentos, StatCard } from "@/components/ui";

// Área Caixa: Extrato, A receber e A pagar são abas da mesma tela. As rotas continuam as de sempre
// (/fluxo-de-caixa, /contas-a-receber, /contas-a-pagar), que links, avisos do WhatsApp e notificações já usam;
// cada página abre com este topo comum (título, saldo em caixa e abas que mudam a URL).
export const ABAS_CAIXA = [
  { aba: "extrato", href: "/fluxo-de-caixa", label: "Extrato" },
  { aba: "receber", href: "/contas-a-receber", label: "A receber" },
  { aba: "pagar", href: "/contas-a-pagar", label: "A pagar" },
] as const;

export type AbaCaixa = (typeof ABAS_CAIXA)[number]["aba"];

export async function CaixaTopo({ aba, action }: { aba: AbaCaixa; action?: ReactNode }) {
  const supabase = await createClient();
  const hoje = hojeISO();
  const [{ data: saldoData }, { data: hojeData }] = await Promise.all([
    // saldo somado no banco (somar no app cortava em 1000 lançamentos); lançamento futuro ainda não conta
    supabase.rpc("saldo_caixa", { p_ate: hoje }),
    supabase.from("lancamentos_caixa").select("tipo, valor").eq("data", hoje).eq("afeta_caixa", true),
  ]);
  const saldo = Number(saldoData ?? 0);
  const movimento = (hojeData ?? []).reduce((s, l) => s + (l.tipo === "entrada" ? Number(l.valor) : -Number(l.valor)), 0);

  return (
    <>
      <PageHeader title="Caixa" action={action} />
      <div className="mb-7 flex flex-col gap-4">
        <StatCard
          label="Saldo em caixa"
          value={formatBRL(saldo)}
          tone={saldo >= 0 ? "neutral" : "negative"}
          hint={movimento ? `${movimento > 0 ? "+" : "−"} ${formatBRL(Math.abs(movimento))} hoje` : "Nada entrou nem saiu hoje"}
          className="sm:max-w-xs"
        />
        <Segmentos
          rotulo="Seções do caixa"
          substituir={false}
          className="sm:w-[24rem]"
          itens={ABAS_CAIXA.map((a) => ({ href: a.href, label: a.label, ativo: a.aba === aba }))}
        />
      </div>
    </>
  );
}
