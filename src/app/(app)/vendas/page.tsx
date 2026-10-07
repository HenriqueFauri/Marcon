import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Venda } from "@/types/domain";
import { formatBRL, formatData } from "@/lib/format";
import { comecarNaPrimeira, resolverPeriodo } from "@/lib/periodo";
import { PeriodoPicker } from "@/components/periodo-picker";
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

const LIMITE_LISTA = 300;
const PAGINA_TOTAIS = 1000; // o PostgREST devolve no máximo 1000 linhas por consulta

export default async function VendasPage({ searchParams }: PageProps<"/vendas">) {
  const sp = await searchParams;
  const texto = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
  let periodo = resolverPeriodo({ mes: texto(sp.mes), meses: texto(sp.meses), todo: texto(sp.todo), de: texto(sp.de), ate: texto(sp.ate) });
  const noMes = periodo.modo === "mes";

  const supabase = await createClient();
  if (periodo.modo === "todo") {
    const { data: primeira } = await supabase.from("vendas").select("data").order("data", { ascending: true }).limit(1);
    periodo = comecarNaPrimeira(periodo, primeira?.[0]?.data);
  }
  const { inicio, fimExclusivo } = periodo;
  const { data, error, count } = await supabase
    .from("vendas")
    .select("*", { count: "exact" })
    .gte("data", inicio)
    .lt("data", fimExclusivo)
    .order("data", { ascending: false })
    .order("created_at", { ascending: false })
    .range(0, LIMITE_LISTA - 1);

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
  const totalDeVendas = count ?? vendas.length;

  // os totais cobrem o período inteiro, mesmo quando a lista mostra só as mais recentes
  let base = vendas;
  if (totalDeVendas > vendas.length) {
    base = [];
    for (let de = 0; de < totalDeVendas; de += PAGINA_TOTAIS) {
      const { data: pagina, error: erroPagina } = await supabase
        .from("vendas")
        .select("valor_total, custo_total, status")
        .gte("data", inicio)
        .lt("data", fimExclusivo)
        .order("data", { ascending: false })
        .order("created_at", { ascending: false })
        .range(de, de + PAGINA_TOTAIS - 1);
      if (erroPagina) {
        return (
          <div>
            <PageHeader title="Vendas" action={novaVenda} />
            <ErrorMessage>Não foi possível carregar as vendas: {erroPagina.message}</ErrorMessage>
          </div>
        );
      }
      base.push(...((pagina ?? []) as Venda[]));
    }
  }
  const concluidas = base.filter((v) => v.status !== "cancelada");
  const totalVendido = concluidas.reduce((s, v) => s + Number(v.valor_total), 0);
  const lucroTotal = concluidas.reduce((s, v) => s + (Number(v.valor_total) - Number(v.custo_total)), 0);
  const ticketMedio = concluidas.length ? totalVendido / concluidas.length : 0;
  const margem = totalVendido > 0 ? (lucroTotal / totalVendido) * 100 : 0;

  // vendas do período agrupadas por dia, na ordem em que já vieram (mais recentes primeiro)
  const porDia: [string, typeof vendas][] = [];
  for (const v of vendas) {
    const ultimo = porDia[porDia.length - 1];
    if (ultimo && ultimo[0] === v.data) ultimo[1].push(v);
    else porDia.push([v.data, [v]]);
  }

  return (
    <div>
      <PageHeader title="Vendas" action={novaVenda} />

      <div className="mb-4 flex flex-col gap-3">
        <PeriodoPicker periodo={periodo} basePath="/vendas" />
        {!noMes && (
          <p className="text-[13px] text-ink-muted">
            {periodo.modo === "todo" ? `Desde a primeira venda, ${formatData(periodo.de)}, até hoje` : `De ${formatData(periodo.de)} até ${formatData(periodo.ate)}`}
          </p>
        )}
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
          title={noMes ? "Nenhuma venda neste mês" : "Nenhuma venda neste período"}
          description="Quando você registrar uma venda, ela aparece aqui com o lucro calculado automaticamente."
          action={novaVenda}
        />
      ) : (
        <>
        {/* no celular, lista agrupada por dia (como o app Carteira); a tabela fica para telas largas */}
        <div className="flex flex-col gap-6 sm:hidden">
          {porDia.map(([dia, doDia]) => (
            <section key={dia}>
              <h2 className="mb-1.5 px-4 text-[13px] uppercase text-ink-muted">{formatData(dia)}</h2>
              <ul className="hairline divide-y divide-line overflow-hidden rounded-3xl bg-surface">
                {doDia.map((v) => {
                  const cancelada = v.status === "cancelada";
                  const lucro = Number(v.valor_total) - Number(v.custo_total);
                  return (
                    <li key={v.id}>
                      <Link
                        href={`/vendas/${v.id}`}
                        className={`flex items-center gap-3 px-4 py-3 transition active:bg-fill ${cancelada ? "opacity-50" : ""}`}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[17px] text-ink">{v.cliente_nome ?? "Avulsa"}</span>
                          <span className="block truncate text-[13px] text-ink-muted">
                            {cancelada ? "Cancelada" : [v.canal, v.tipo_pagamento === "a_prazo" ? "A prazo" : v.forma_pagamento].filter(Boolean).join(" · ") || "À vista"}
                          </span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className={`block text-[17px] tabular-nums text-ink ${cancelada ? "line-through" : ""}`}>{formatBRL(v.valor_total)}</span>
                          {!cancelada && (
                            <span className={`block text-[13px] tabular-nums ${lucro >= 0 ? "text-positive" : "text-danger"}`}>
                              {lucro >= 0 ? "+" : ""}
                              {formatBRL(lucro)}
                            </span>
                          )}
                        </span>
                        <span aria-hidden="true" className="text-lg text-ink-faint">
                          ›
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
        <div className="hidden sm:block">
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
        </div>
        </>
      )}
      {totalDeVendas > vendas.length && (
        <p className="mt-3 text-center text-[13px] text-ink-muted">
          Mostrando as {vendas.length} mais recentes de {totalDeVendas}. Os totais acima somam todas.
        </p>
      )}
    </div>
  );
}
