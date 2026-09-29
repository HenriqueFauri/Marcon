import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { LancamentoCaixa } from "@/types/domain";
import { formatBRL, formatData, hojeISO, intervaloDoMes, mesAtual, mesValido } from "@/lib/format";
import { MonthPicker } from "@/components/month-picker";
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
import { excluirLancamento } from "./actions";

export const metadata: Metadata = { title: "Fluxo de caixa" };

function origem(l: LancamentoCaixa) {
  if (l.parcela_id) return { label: "Parcela", tone: "positive" as const };
  if (l.venda_id) return l.tipo === "saida" ? { label: "Estorno", tone: "negative" as const } : { label: "Venda", tone: "positive" as const };
  if (l.movimento_estoque_id || l.origem === "compra") return { label: "Estoque", tone: "info" as const };
  return { label: "Manual", tone: "neutral" as const };
}

export default async function FluxoDeCaixaPage({ searchParams }: PageProps<"/fluxo-de-caixa">) {
  const sp = await searchParams;
  const mes = mesValido(typeof sp.mes === "string" ? sp.mes : null) ?? mesAtual();
  const tipo = sp.tipo === "entrada" || sp.tipo === "saida" ? sp.tipo : undefined;
  const { inicio, fimExclusivo } = intervaloDoMes(mes);

  const supabase = await createClient();
  let query = supabase
    .from("lancamentos_caixa")
    .select("*")
    .gte("data", inicio)
    .lt("data", fimExclusivo)
    .order("data", { ascending: false })
    .order("created_at", { ascending: false });
  if (tipo) query = query.eq("tipo", tipo);

  const [{ data, error }, { data: anterioresData }] = await Promise.all([
    query,
    // saldo acumulado até o início do mês, pra mostrar o saldo real do caixa
    supabase.from("lancamentos_caixa").select("tipo, valor").lt("data", inicio),
  ]);

  const hoje = hojeISO();

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
  const saldoAnterior = (anterioresData ?? []).reduce(
    (s, l) => s + (l.tipo === "entrada" ? Number(l.valor) : -Number(l.valor)),
    0,
  );

  // gastos por categoria no mês
  const porCategoria = new Map<string, number>();
  for (const l of lancamentos) {
    if (l.tipo !== "saida") continue;
    porCategoria.set(l.categoria, (porCategoria.get(l.categoria) ?? 0) + Number(l.valor));
  }
  const topCategorias = [...porCategoria.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  const filtroHref = (t?: string) => {
    const qs = new URLSearchParams();
    if (mes !== mesAtual()) qs.set("mes", mes);
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

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <MonthPicker mes={mes} basePath="/fluxo-de-caixa" params={{ tipo }} />
        <div className="flex gap-1">
          {[
            [undefined, "Tudo"],
            ["entrada", "Entradas"],
            ["saida", "Saídas"],
          ].map(([valor, rotulo]) => (
            <Link
              key={rotulo}
              href={filtroHref(valor)}
              className={`rounded-lg px-3 py-1.5 text-sm ${tipo === valor ? "bg-neutral-800 font-medium text-white" : "text-neutral-400 hover:text-white"}`}
            >
              {rotulo}
            </Link>
          ))}
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Entradas no mês" value={formatBRL(entradas)} tone="positive" />
        <StatCard label="Saídas no mês" value={formatBRL(saidas)} tone="negative" />
        <StatCard label="Resultado do mês" value={formatBRL(resultado)} tone={resultado >= 0 ? "positive" : "negative"} />
        <StatCard
          label="Saldo em caixa"
          value={formatBRL(saldoAnterior + resultado)}
          tone={saldoAnterior + resultado >= 0 ? "neutral" : "negative"}
          hint={`${formatBRL(saldoAnterior)} vindo do mês anterior`}
        />
      </div>

      {!tipo && topCategorias.length > 0 && (
        <div className="mb-6 rounded-xl border border-neutral-800 bg-neutral-900 p-4">
          <h2 className="mb-3 text-sm font-semibold text-white">Para onde foi o dinheiro</h2>
          <ul className="space-y-2">
            {topCategorias.map(([cat, valor]) => (
              <li key={cat} className="text-sm">
                <div className="mb-1 flex justify-between">
                  <span className="text-neutral-300">{cat}</span>
                  <span className="tabular-nums text-neutral-400">{formatBRL(valor)}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-neutral-800">
                  <div className="h-full rounded-full bg-red-400/70" style={{ width: `${(valor / saidas) * 100}%` }} />
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
                <tr key={l.id} className="hover:bg-neutral-900/60">
                  <td className={`${tdClass} whitespace-nowrap text-neutral-300`}>{formatData(l.data)}</td>
                  <td className={tdClass}>
                    {l.venda_id ? (
                      <Link href={`/vendas/${l.venda_id}`} className="text-white hover:underline">
                        {l.descricao}
                      </Link>
                    ) : l.produto_id ? (
                      <Link href={`/produtos/${l.produto_id}`} className="text-white hover:underline">
                        {l.descricao}
                      </Link>
                    ) : (
                      <span className="text-white">{l.descricao}</span>
                    )}
                    <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                      <Badge tone={o.tone}>{o.label}</Badge>
                      <span className="text-xs text-neutral-500 sm:hidden">{l.categoria}</span>
                    </span>
                  </td>
                  <td className={`${tdClass} hidden text-neutral-400 sm:table-cell`}>{l.categoria}</td>
                  <td
                    className={`${tdClass} whitespace-nowrap text-right font-medium tabular-nums ${l.tipo === "entrada" ? "text-emerald-400" : "text-red-400"}`}
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
