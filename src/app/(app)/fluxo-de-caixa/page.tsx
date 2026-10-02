import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { LancamentoCaixa } from "@/types/domain";
import { formatBRL, formatData, hojeISO, somarDias } from "@/lib/format";
import { paramsDoPeriodo, resolverPeriodo } from "@/lib/periodo";
import { ConfirmButton } from "@/components/confirm-button";
import {
  Badge,
  EmptyState,
  ErrorMessage,
  PageHeader,
  StatCard,
  Table,
  tbodyClass,
  tdClass,
  thClass,
  theadClass,
} from "@/components/ui";
import { NovoLancamentoForm } from "./novo-lancamento-form";
import { PeriodoCaixaPicker } from "./periodo-caixa";
import { excluirLancamento } from "./actions";

export const metadata: Metadata = { title: "Fluxo de caixa" };

function origem(l: LancamentoCaixa) {
  if (l.parcela_id) return { label: "Parcela", tone: "positive" as const };
  if (l.venda_id) return l.tipo === "saida" || l.origem === "ajuste" ? { label: "Estorno", tone: "negative" as const } : { label: "Venda", tone: "positive" as const };
  if (l.movimento_estoque_id || l.origem === "compra") return { label: "Estoque", tone: "info" as const };
  return { label: "Manual", tone: "neutral" as const };
}

export default async function FluxoDeCaixaPage({ searchParams }: PageProps<"/fluxo-de-caixa">) {
  const sp = await searchParams;
  const texto = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
  const periodo = resolverPeriodo({ mes: texto(sp.mes), dias: texto(sp.dias), de: texto(sp.de), ate: texto(sp.ate) });
  const tipo = sp.tipo === "entrada" || sp.tipo === "saida" ? sp.tipo : undefined;
  const { inicio, fimExclusivo } = periodo;
  const noMes = periodo.modo === "mes";

  const supabase = await createClient();
  let query = supabase
    .from("lancamentos_caixa")
    .select("*")
    .gte("data", inicio)
    .lt("data", fimExclusivo)
    .order("data", { ascending: false })
    .order("created_at", { ascending: false });
  if (tipo) query = query.eq("tipo", tipo);

  const hoje = hojeISO();
  // saldo real: até hoje (lançamento com data futura ainda não está no caixa) ou
  // até o fim do período consultado; somado no banco pra não cortar em 1000 linhas
  const ultimoDia = somarDias(fimExclusivo, -1);
  const [{ data, error }, { data: saldoFinalData }, { data: saldoAnteriorData }] = await Promise.all([
    query,
    supabase.rpc("saldo_caixa", { p_ate: ultimoDia < hoje ? ultimoDia : hoje }),
    supabase.rpc("saldo_caixa", { p_ate: somarDias(inicio, -1) }),
  ]);

  if (error) {
    return (
      <div>
        <PageHeader title="Fluxo de caixa" />
        <ErrorMessage>Não foi possível carregar o fluxo de caixa: {error.message}</ErrorMessage>
      </div>
    );
  }

  const lancamentos = (data ?? []) as LancamentoCaixa[];
  const categorias = Array.from(new Set(lancamentos.map((l) => l.categoria)));
  const soma = (t: "entrada" | "saida") =>
    lancamentos.filter((l) => l.tipo === t).reduce((s, l) => s + Number(l.valor), 0);
  const entradas = soma("entrada");
  const saidas = soma("saida");
  const resultado = entradas - saidas;
  const saldoAnterior = Number(saldoAnteriorData ?? 0);
  const saldoEmCaixa = Number(saldoFinalData ?? 0);

  // gastos por categoria no período
  const porCategoria = new Map<string, number>();
  for (const l of lancamentos) {
    if (l.tipo !== "saida") continue;
    porCategoria.set(l.categoria, (porCategoria.get(l.categoria) ?? 0) + Number(l.valor));
  }
  const topCategorias = [...porCategoria.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  const filtroHref = (t?: string) => {
    const qs = new URLSearchParams(paramsDoPeriodo(periodo));
    if (t) qs.set("tipo", t);
    const s = qs.toString();
    return s ? `/fluxo-de-caixa?${s}` : "/fluxo-de-caixa";
  };

  return (
    <div>
      <PageHeader
        title="Fluxo de caixa"
        description="Vendas, parcelas, compras de estoque e lançamentos manuais num só lugar."
        action={<NovoLancamentoForm hoje={hoje} categorias={categorias} />}
      />

      <div className="mb-4 flex flex-col gap-3">
        <PeriodoCaixaPicker periodo={periodo} tipo={tipo} />
        {!noMes && (
          <p className="text-[13px] text-ink-muted">
            De {formatData(periodo.de)} até {formatData(periodo.ate)}
          </p>
        )}
        <div className="flex gap-1">
          {[
            [undefined, "Tudo"],
            ["entrada", "Entradas"],
            ["saida", "Saídas"],
          ].map(([valor, rotulo]) => (
            <Link
              key={rotulo}
              href={filtroHref(valor)}
              className={`rounded-lg px-3 py-1.5 text-sm ${tipo === valor ? "bg-fill font-medium text-ink" : "text-ink-muted hover:text-ink"}`}
            >
              {rotulo}
            </Link>
          ))}
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={noMes ? "Entradas no mês" : "Entradas no período"} value={formatBRL(entradas)} tone="positive" />
        <StatCard label={noMes ? "Saídas no mês" : "Saídas no período"} value={formatBRL(saidas)} tone="negative" />
        <StatCard label={noMes ? "Resultado do mês" : "Resultado do período"} value={formatBRL(resultado)} tone={resultado >= 0 ? "positive" : "negative"} />
        <StatCard
          label="Saldo em caixa"
          value={formatBRL(saldoEmCaixa)}
          tone={saldoEmCaixa >= 0 ? "neutral" : "negative"}
          hint={`${formatBRL(saldoAnterior)} ${noMes ? "vindo do mês anterior" : "antes do período"}`}
        />
      </div>

      {!tipo && topCategorias.length > 0 && (
        <div className="hairline mb-6 rounded-3xl bg-surface p-5">
          <h2 className="mb-3 text-sm font-semibold text-ink">Para onde foi o dinheiro</h2>
          <ul className="space-y-2">
            {topCategorias.map(([cat, valor]) => (
              <li key={cat} className="text-sm">
                <div className="mb-1 flex justify-between">
                  <span className="text-ink-2">{cat}</span>
                  <span className="tabular-nums text-ink-muted">{formatBRL(valor)}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-fill">
                  <div className="h-full rounded-full bg-danger/70" style={{ width: `${(valor / saidas) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {lancamentos.length === 0 ? (
        <EmptyState
          title="Nenhum lançamento neste período"
          description="Vendas à vista, parcelas recebidas e compras de estoque entram aqui automaticamente."
        />
      ) : (
        <Table compacta>
          <thead className={theadClass}>
            <tr>
              <th className={thClass}>Data</th>
              <th className={thClass}>Descrição</th>
              <th className={`${thClass} hidden sm:table-cell`}>Categoria</th>
              <th className={`${thClass} text-right`}>Valor</th>
              <th className={`${thClass} text-right`}>
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody className={tbodyClass}>
            {lancamentos.map((l) => {
              const o = origem(l);
              const manual = o.label === "Manual";
              return (
                <tr key={l.id} className="hover:bg-fill/50">
                  <td className={`${tdClass} whitespace-nowrap text-ink-2`}>{formatData(l.data)}</td>
                  <td className={tdClass}>
                    {l.venda_id ? (
                      <Link href={`/vendas/${l.venda_id}`} className="text-ink hover:underline">
                        {l.descricao}
                      </Link>
                    ) : l.produto_id ? (
                      <Link href={`/produtos/${l.produto_id}`} className="text-ink hover:underline">
                        {l.descricao}
                      </Link>
                    ) : (
                      <span className="text-ink">{l.descricao}</span>
                    )}
                    <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                      <Badge tone={o.tone}>{o.label}</Badge>
                      <span className="text-xs text-ink-muted sm:hidden">{l.categoria}</span>
                    </span>
                  </td>
                  <td className={`${tdClass} hidden text-ink-muted sm:table-cell`}>{l.categoria}</td>
                  <td
                    className={`${tdClass} whitespace-nowrap text-right font-medium tabular-nums ${l.tipo === "entrada" ? "text-positive" : "text-danger"}`}
                  >
                    {l.tipo === "entrada" ? "+ " : "− "}
                    {formatBRL(l.valor)}
                  </td>
                  <td className={`${tdClass} text-right`}>
                    {manual && (
                      <ConfirmButton
                        title="Excluir este lançamento?"
                        description={`${l.descricao} — ${formatBRL(l.valor)}`}
                        ariaLabel="Excluir lançamento"
                        onConfirm={excluirLancamento.bind(null, l.id)}
                      />
                    )}
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
