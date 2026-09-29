import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Venda } from "@/types/domain";
import { formatBRL, formatData, intervaloDoMes, mesAtual, mesValido } from "@/lib/format";
import { MonthPicker } from "@/components/month-picker";
import {
  Badge,
  EmptyState,
  ErrorMessage,
  PageHeader,
  StatCard,
  Table,
  btnPrimary,
  tbodyClass,
  tdClass,
  thClass,
  theadClass,
} from "@/components/ui";
import { IconPlus } from "@/components/icons";

export const metadata: Metadata = { title: "Vendas" };

export default async function VendasPage({ searchParams }: PageProps<"/vendas">) {
  const sp = await searchParams;
  const mes = mesValido(typeof sp.mes === "string" ? sp.mes : null) ?? mesAtual();
  const { inicio, fimExclusivo } = intervaloDoMes(mes);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vendas")
    .select("*")
    .gte("data", inicio)
    .lt("data", fimExclusivo)
    .order("data", { ascending: false })
    .order("created_at", { ascending: false });

  const novaVenda = (
    <Link href="/vendas/novo" className={btnPrimary}>
      <IconPlus width={16} height={16} /> Nova venda
    </Link>
  );

  if (error) {
    return (
      <div>
        <PageHeader title="Vendas" action={novaVenda} />
        <ErrorMessage>Não foi possível carregar as vendas: {error.message}</ErrorMessage>
      </div>
    );
  }

  const vendas = (data ?? []) as Venda[];
  const concluidas = vendas.filter((v) => v.status !== "cancelada");
  const totalVendido = concluidas.reduce((s, v) => s + Number(v.valor_total), 0);
  const lucroTotal = concluidas.reduce((s, v) => s + (Number(v.valor_total) - Number(v.custo_total)), 0);
  const ticketMedio = concluidas.length ? totalVendido / concluidas.length : 0;
  const margem = totalVendido > 0 ? (lucroTotal / totalVendido) * 100 : 0;

  return (
    <div>
      <PageHeader title="Vendas" description="Registre e acompanhe suas vendas." action={novaVenda} />

      <div className="mb-4">
        <MonthPicker mes={mes} basePath="/vendas" />
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total vendido" value={formatBRL(totalVendido)} />
        <StatCard
          label="Lucro bruto"
          value={formatBRL(lucroTotal)}
          tone={lucroTotal >= 0 ? "positive" : "negative"}
          hint={`${margem.toFixed(1)}% de margem`}
        />
        <StatCard label="Vendas" value={concluidas.length} />
        <StatCard label="Ticket médio" value={formatBRL(ticketMedio)} />
      </div>

      {vendas.length === 0 ? (
        <EmptyState
          title="Nenhuma venda neste mês"
          description="Quando você registrar uma venda, ela aparece aqui com o lucro calculado automaticamente."
          action={novaVenda}
        />
      ) : (
        <Table compacta>
          <thead className={theadClass}>
            <tr>
              <th className={thClass}>Data</th>
              <th className={thClass}>Cliente</th>
              <th className={`${thClass} hidden sm:table-cell`}>Pagamento</th>
              <th className={`${thClass} text-right`}>Total</th>
              <th className={`${thClass} hidden text-right sm:table-cell`}>Lucro</th>
            </tr>
          </thead>
          <tbody className={tbodyClass}>
            {vendas.map((v) => {
              const cancelada = v.status === "cancelada";
              const lucro = Number(v.valor_total) - Number(v.custo_total);
              return (
                <tr key={v.id} className={`relative hover:bg-fill/50 ${cancelada ? "opacity-50" : ""}`}>
                  <td className={`${tdClass} whitespace-nowrap text-ink-2`}>
                    <Link href={`/vendas/${v.id}`} className="after:absolute after:inset-0">
                      {formatData(v.data)}
                    </Link>
                  </td>
                  <td className={`${tdClass} text-ink`}>
                    {v.cliente_nome ?? <span className="text-ink-muted">Avulsa</span>}
                    {v.canal && <span className="block text-xs text-ink-muted">{v.canal}</span>}
                    <span className="mt-0.5 block sm:hidden">
                      {cancelada ? (
                        <Badge tone="negative">Cancelada</Badge>
                      ) : (
                        v.tipo_pagamento === "a_prazo" && <Badge tone="warning">A prazo</Badge>
                      )}
                    </span>
                  </td>
                  <td className={`${tdClass} hidden text-ink-muted sm:table-cell`}>
                    {cancelada ? (
                      <Badge tone="negative">Cancelada</Badge>
                    ) : (
                      <>
                        {v.tipo_pagamento === "a_prazo" ? <Badge tone="warning">A prazo</Badge> : "À vista"}
                        {v.forma_pagamento && <span className="ml-1">· {v.forma_pagamento}</span>}
                      </>
                    )}
                  </td>
                  <td className={`${tdClass} text-right tabular-nums text-ink ${cancelada ? "line-through" : ""}`}>
                    {formatBRL(v.valor_total)}
                  </td>
                  <td
                    className={`${tdClass} hidden text-right tabular-nums sm:table-cell ${lucro >= 0 ? "text-positive" : "text-danger"} ${cancelada ? "line-through" : ""}`}
                  >
                    {formatBRL(lucro)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </div>
  );
}
