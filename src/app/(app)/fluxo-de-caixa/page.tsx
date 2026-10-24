import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import type { LancamentoCaixa } from "@/types/domain";
import { formatBRL, formatData, hojeISO, somarDias } from "@/lib/format";
import { mensagemDeErro } from "@/lib/action";
import { comecarNaPrimeira, paramsDoPeriodo, resolverPeriodo } from "@/lib/periodo";
import { Grupo } from "@/components/ajustes";
import { SetaLink, linkPendente } from "@/components/seta-link";
import {
  EmptyState,
  ErrorMessage,
  Segmentos,
  StatCard,
  Table,
  tbodyClass,
  tdClass,
  thClass,
  theadClass,
} from "@/components/ui";
import { SeletorPeriodo } from "@/components/seletor-periodo";
import { CaixaTopo } from "../caixa/topo";
import { LancamentoForm } from "./novo-lancamento-form";

export const metadata: Metadata = { title: "Caixa" };

// a lista mostra os mais recentes; os totais vêm do banco (resumo_caixa) e valem para o período todo
const LIMITE_LISTA = 300;

interface ResumoCaixa {
  entradas: number;
  saidas: number;
  categorias: { categoria: string; valor: number }[];
}

// de onde veio o lançamento; vai como texto no detalhe da linha (selo só para estado raro)
function origem(l: LancamentoCaixa) {
  if (l.parcela_id) return "Parcela";
  if (l.venda_id) return l.tipo === "saida" || l.origem === "ajuste" ? "Estorno" : "Venda";
  if (l.movimento_estoque_id || l.origem === "compra") return "Estoque";
  return "Manual";
}

function detalhe(l: LancamentoCaixa) {
  const o = origem(l);
  return o === l.categoria || o === "Manual" ? l.categoria : `${o} · ${l.categoria}`;
}

function Valor({ l, className = "" }: { l: LancamentoCaixa; className?: string }) {
  return (
    <span className={`whitespace-nowrap tabular-nums ${l.tipo === "entrada" ? "text-positive" : "text-ink"} ${className}`}>
      {l.tipo === "entrada" ? "+ " : "− "}
      {formatBRL(l.valor)}
    </span>
  );
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
  // saldo no fim de um período que já passou (o saldo de hoje fica no topo da área)
  const ultimoDia = somarDias(fimExclusivo, -1);
  const periodoPassado = ultimoDia < hoje;
  const [{ data, error, count }, { data: saldoFinalData }, { data: saldoAnteriorData }, { data: resumoData, error: resumoError }] =
    await Promise.all([
      query,
      supabase.rpc("saldo_caixa", { p_ate: periodoPassado ? ultimoDia : hoje }),
      supabase.rpc("saldo_caixa", { p_ate: somarDias(inicio, -1) }),
      supabase.rpc("resumo_caixa", { p_inicio: inicio, p_fim_exclusivo: fimExclusivo }),
    ]);

  const erroCarregar = error ?? resumoError;
  if (erroCarregar) {
    return (
      <div>
        <CaixaTopo aba="extrato" />
        <ErrorMessage>Não foi possível carregar o extrato: {mensagemDeErro(erroCarregar)}</ErrorMessage>
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
  const saldoFinal = Number(saldoFinalData ?? 0);

  // maiores gastos por categoria no período
  const topCategorias = resumo.categorias.map((c) => [c.categoria, Number(c.valor)] as const);

  const filtroHref = (t?: string) => {
    const qs = new URLSearchParams(paramsDoPeriodo(periodo));
    if (t) qs.set("tipo", t);
    const s = qs.toString();
    return s ? `/fluxo-de-caixa?${s}` : "/fluxo-de-caixa";
  };

  // lista do celular separada por dia, como em Vendas
  const porDia = new Map<string, LancamentoCaixa[]>();
  for (const l of lancamentos) porDia.set(l.data, [...(porDia.get(l.data) ?? []), l]);

  // a linha leva à venda ou ao produto; lançamento manual abre a janela de editar (com excluir no fim)
  const linha = (l: LancamentoCaixa, conteudo: ReactNode, classe: string, comSeta: boolean): ReactNode => {
    const seta = comSeta ? <SetaLink /> : null;
    if (l.venda_id || l.produto_id) {
      return (
        <Link href={l.venda_id ? `/vendas/${l.venda_id}` : `/produtos/${l.produto_id}`} className={`${classe} ${linkPendente}`}>
          {conteudo}
          {seta}
        </Link>
      );
    }
    if (origem(l) === "Manual") {
      return (
        <LancamentoForm
          hoje={hoje}
          categorias={categorias}
          lancamento={{ id: l.id, tipo: l.tipo, descricao: l.descricao, valor: Number(l.valor), data: l.data, categoria: l.categoria }}
          triggerClassName={`${classe} w-full text-left`}
          trigger={
            <>
              {conteudo}
              {comSeta && (
                <span aria-hidden="true" className="text-lg text-ink-faint">
                  ›
                </span>
              )}
            </>
          }
        />
      );
    }
    return <div className={classe}>{conteudo}</div>;
  };

  return (
    <div>
      <CaixaTopo aba="extrato" action={<LancamentoForm hoje={hoje} categorias={categorias} />} />

      <div className="flex flex-col gap-7">
        <div className="flex flex-col gap-3">
          <SeletorPeriodo tipo="caixa" periodo={periodo} basePath="/fluxo-de-caixa" params={{ tipo }} />
          {!noMes && (
            <p className="px-1 text-[13px] text-ink-muted">
              {periodo.modo === "todo" ? <>Desde o primeiro lançamento, {formatData(periodo.de)}, até hoje</> : <>De {formatData(periodo.de)} até {formatData(periodo.ate)}</>}
            </p>
          )}
          <Segmentos
            rotulo="Tipo de lançamento"
            className="sm:w-80"
            itens={[
              { href: filtroHref(), label: "Tudo", ativo: !tipo },
              { href: filtroHref("entrada"), label: "Entradas", ativo: tipo === "entrada" },
              { href: filtroHref("saida"), label: "Saídas", ativo: tipo === "saida" },
            ]}
          />
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label={noMes ? "Entradas no mês" : "Entradas no período"} value={formatBRL(entradas)} tone="positive" />
          <StatCard label={noMes ? "Saídas no mês" : "Saídas no período"} value={formatBRL(saidas)} tone="negative" />
          <StatCard
            label={noMes ? "Resultado do mês" : "Resultado do período"}
            value={formatBRL(resultado)}
            tone={resultado >= 0 ? "positive" : "negative"}
            hint="Entrou menos saiu"
            className={periodoPassado ? "" : "col-span-2 lg:col-span-1"}
          />
          {periodoPassado && (
            <StatCard
              label={noMes ? "Saldo no fim do mês" : "Saldo no fim do período"}
              value={formatBRL(saldoFinal)}
              tone={saldoFinal >= 0 ? "neutral" : "negative"}
              hint={`Começou com ${formatBRL(saldoAnterior)}`}
            />
          )}
        </div>

        {!tipo && topCategorias.length > 0 && (
          <Grupo titulo="Para onde foi o dinheiro">
            <ul className="flex flex-col gap-3">
              {topCategorias.map(([cat, valor]) => (
                <li key={cat}>
                  <div className="mb-1 flex justify-between gap-3 text-[15px]">
                    <span className="truncate text-ink">{cat}</span>
                    <span className="shrink-0 tabular-nums text-ink-muted">{formatBRL(valor)}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-fill">
                    <div className="h-full rounded-full bg-danger/70" style={{ width: `${saidas > 0 ? (valor / saidas) * 100 : 0}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </Grupo>
        )}

        {lancamentos.length === 0 ? (
          <EmptyState
            title="Nenhum lançamento neste período"
            description="Vendas à vista, parcelas recebidas e compras de estoque entram aqui sozinhas."
          />
        ) : (
          <div className="flex flex-col gap-3">
            {/* celular: lista agrupada por dia */}
            <div className="flex flex-col gap-6 sm:hidden">
              {Array.from(porDia).map(([dia, doDia]) => (
                <section key={dia}>
                  <h2 className="mb-1.5 px-4 text-[13px] uppercase text-ink-muted">{dia === hoje ? "Hoje" : formatData(dia)}</h2>
                  <ul className="hairline divide-y divide-line overflow-hidden rounded-3xl bg-surface">
                    {doDia.map((l) => (
                      <li key={l.id}>
                        {linha(
                          l,
                          <>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[17px] text-ink">{l.descricao}</span>
                              <span className="block truncate text-[13px] text-ink-muted">{detalhe(l)}</span>
                            </span>
                            <Valor l={l} className="shrink-0 text-[17px]" />
                          </>,
                          "flex items-center gap-3 px-4 py-3 transition active:bg-fill",
                          true,
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>

            {/* computador: tabela */}
            <div className="hidden sm:block">
              <Table compacta>
                <thead className={theadClass}>
                  <tr>
                    <th className={thClass}>Data</th>
                    <th className={thClass}>Descrição</th>
                    <th className={thClass}>Categoria</th>
                    <th className={`${thClass} text-right`}>Valor</th>
                  </tr>
                </thead>
                <tbody className={tbodyClass}>
                  {lancamentos.map((l) => {
                    const o = origem(l);
                    return (
                      <tr key={l.id} className="hover:bg-fill/50">
                        <td className={`${tdClass} whitespace-nowrap text-ink-2`}>{formatData(l.data)}</td>
                        <td className={tdClass}>
                          {linha(
                            l,
                            <span className="min-w-0">
                              <span className="block text-ink hover:underline">{l.descricao}</span>
                              <span className="block text-xs text-ink-muted">{o}</span>
                            </span>,
                            "block",
                            false,
                          )}
                        </td>
                        <td className={`${tdClass} text-ink-muted`}>{l.categoria}</td>
                        <td className={`${tdClass} text-right font-medium`}>
                          <Valor l={l} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </div>

            {totalDeLancamentos > lancamentos.length && (
              <p className="px-4 text-[13px] text-ink-muted">
                Mostrando os {lancamentos.length} mais recentes de {totalDeLancamentos}. Os totais acima contam todos. Escolha um período menor para ver o resto.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
