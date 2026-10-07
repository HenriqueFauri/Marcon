import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { LancamentoCaixa } from "@/types/domain";
import { formatBRL, formatData, hojeISO, somarDias } from "@/lib/format";
import { mensagemDeErro } from "@/lib/action";
import { comecarNaPrimeira, paramsDoPeriodo, resolverPeriodo } from "@/lib/periodo";
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
import { PeriodoPicker } from "@/components/periodo-picker";
import { excluirLancamento } from "./actions";

export const metadata: Metadata = { title: "Fluxo de caixa" };

// a lista mostra os mais recentes; os totais vêm do banco (resumo_caixa) e valem para o período todo
const LIMITE_LISTA = 300;

interface ResumoCaixa {
  entradas: number;
  saidas: number;
  categorias: { categoria: string; valor: number }[];
}

function origem(l: LancamentoCaixa) {
  if (l.parcela_id) return { label: "Parcela", tone: "positive" as const };
  if (l.venda_id) return l.tipo === "saida" || l.origem === "ajuste" ? { label: "Estorno", tone: "negative" as const } : { label: "Venda", tone: "positive" as const };
  if (l.movimento_estoque_id || l.origem === "compra") return { label: "Estoque", tone: "info" as const };
  return { label: "Manual", tone: "neutral" as const };
}

export default async function FluxoDeCaixaPage({ searchParams }: PageProps<"/fluxo-de-caixa">) {
  const sp = await searchParams;
  const texto = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
  let periodo = resolverPeriodo({ mes: texto(sp.mes), meses: texto(sp.meses), todo: texto(sp.todo), de: texto(sp.de), ate: texto(sp.ate) });
  const tipo = sp.tipo === "entrada" || sp.tipo === "saida" ? sp.tipo : undefined;
  const noMes = periodo.modo === "mes";

  const supabase = await createClient();
  if (periodo.modo === "todo") {
    const { data: primeiro } = await supabase.from("lancamentos_caixa").select("data").order("data", { ascending: true }).limit(1);
    periodo = comecarNaPrimeira(periodo, primeiro?.[0]?.data);
  }
  const { inicio, fimExclusivo } = periodo;
  let query = supabase
    .from("lancamentos_caixa")
    .select("*", { count: "exact" })
    .gte("data", inicio)
    .lt("data", fimExclusivo)
    .order("data", { ascending: false })
    .order("created_at", { ascending: false })
    .range(0, LIMITE_LISTA - 1);
  if (tipo) query = query.eq("tipo", tipo);

  const hoje = hojeISO();
  // saldo real: até hoje (lançamento com data futura ainda não está no caixa) ou
  // até o fim do período consultado; tudo somado no banco pra não cortar em 1000 linhas
  const ultimoDia = somarDias(fimExclusivo, -1);
  const [{ data, error, count }, { data: saldoFinalData }, { data: saldoAnteriorData }, { data: resumoData, error: resumoError }] =
    await Promise.all([
      query,
      supabase.rpc("saldo_caixa", { p_ate: ultimoDia < hoje ? ultimoDia : hoje }),
      supabase.rpc("saldo_caixa", { p_ate: somarDias(inicio, -1) }),
      supabase.rpc("resumo_caixa", { p_inicio: inicio, p_fim_exclusivo: fimExclusivo }),
    ]);

  const erroCarregar = error ?? resumoError;
  if (erroCarregar) {
    return (
      <div>
        <PageHeader title="Fluxo de caixa" />
        <ErrorMessage>Não foi possível carregar o fluxo de caixa: {mensagemDeErro(erroCarregar)}</ErrorMessage>
      </div>
    );
  }

  const lancamentos = (data ?? []) as LancamentoCaixa[];
  const totalDeLancamentos = count ?? lancamentos.length;
  const categorias = Array.from(new Set(lancamentos.map((l) => l.categoria)));
  // totais do período inteiro, sempre sem o filtro de tipo (o filtro só muda a lista)
  const resumo = resumoData as ResumoCaixa;
  const entradas = Number(resumo.entradas);
  const saidas = Number(resumo.saidas);
  const resultado = entradas - saidas;
  const saldoAnterior = Number(saldoAnteriorData ?? 0);
  const saldoEmCaixa = Number(saldoFinalData ?? 0);

  // maiores gastos por categoria no período
  const topCategorias = resumo.categorias.map((c) => [c.categoria, Number(c.valor)] as const);

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
        action={<NovoLancamentoForm hoje={hoje} categorias={categorias} />}
      />

      <div className="mb-4 flex flex-col gap-3">
        <PeriodoPicker periodo={periodo} basePath="/fluxo-de-caixa" params={{ tipo }} />
        {!noMes && (
          <p className="text-[13px] text-ink-muted">
            {periodo.modo === "todo" ? <>Desde o primeiro lançamento, {formatData(periodo.de)}, até hoje</> : <>De {formatData(periodo.de)} até {formatData(periodo.ate)}</>}
          </p>
        )}
        {/* mesmo controle segmentado do período, para os filtros da tela terem um estilo só */}
        <div className="grid w-full grid-cols-3 gap-0.5 rounded-full bg-fill p-[3px] sm:w-80" role="group" aria-label="Tipo">
          {[
            [undefined, "Tudo"],
            ["entrada", "Entradas"],
            ["saida", "Saídas"],
          ].map(([valor, rotulo]) => (
            <Link
              key={rotulo}
              href={filtroHref(valor)}
              aria-current={tipo === valor ? "page" : undefined}
              className={`rounded-full px-2 py-2 text-center text-[13px] transition ${tipo === valor ? "bg-surface font-semibold text-ink shadow-sm" : "font-medium text-ink-2 hover:text-ink"}`}
            >
              {rotulo}
            </Link>
          ))}
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={noMes ? "Entradas no mês" : "Entradas no período"} value={formatBRL(entradas)} tone="positive" />
        <StatCard label={noMes ? "Saídas no mês" : "Saídas no período"} value={formatBRL(saidas)} tone="negative" />
        <StatCard
          label={noMes ? "Resultado do mês" : "Resultado do período"}
          value={formatBRL(resultado)}
          tone={resultado >= 0 ? "positive" : "negative"}
          hint="Entrou menos saiu"
        />
        <StatCard
          label="Saldo em caixa"
          value={formatBRL(saldoEmCaixa)}
          tone={saldoEmCaixa >= 0 ? "neutral" : "negative"}
          hint={`${formatBRL(saldoAnterior)} ${noMes ? "do mês anterior" : "antes do período"}`}
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
        <>
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
        {totalDeLancamentos > lancamentos.length && (
          <p className="mt-3 px-1 text-[13px] text-ink-muted">
            Mostrando os {lancamentos.length} mais recentes de {totalDeLancamentos}. Os totais acima contam todos. Escolha um período menor para ver o resto.
          </p>
        )}
        </>
      )}
    </div>
  );
}
