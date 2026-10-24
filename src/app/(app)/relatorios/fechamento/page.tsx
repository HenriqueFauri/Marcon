import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatBRL, mesAtual, mesValido, nomeDoMes } from "@/lib/format";
import { mensagemDeErro } from "@/lib/action";
import { fechamentoDoMes } from "@/lib/fechamento";
import { formatPct, margem, ticketMedio } from "@/lib/relatorios";
import { capasDeProdutos } from "@/lib/relatorios-dados";
import { SeletorPeriodo } from "@/components/seletor-periodo";
import { Grupo } from "@/components/ajustes";
import { ErrorMessage, PageHeader, btnPrimary, btnSecondary, EmptyState } from "@/components/ui";
import { GraficoEvolucao } from "@/components/graficos/evolucao";
import { LinhaBarra } from "@/components/graficos/barras";
import { Rosca, dobrarEmOutros } from "@/components/graficos/rosca";
import { Kpi } from "@/components/graficos/kpi";
import { Variacao } from "@/components/graficos/variacao";
import { FotoProduto } from "@/components/foto-produto";
import { AbasRelatorios } from "../abas";

export const metadata: Metadata = { title: "Fechamento do mês" };

export default async function FechamentoPage({ searchParams }: PageProps<"/relatorios/fechamento">) {
  const sp = await searchParams;
  const mes = mesValido(typeof sp.mes === "string" ? sp.mes : undefined) ?? mesAtual();

  const supabase = await createClient();
  let dados, capas;
  try {
    dados = await fechamentoDoMes(supabase, mes);
    capas = await capasDeProdutos(
      supabase,
      dados.atual.maisLucrativos.map((p) => p.id).filter((id): id is string => !!id),
    );
  } catch (e) {
    return (
      <div>
        <PageHeader title="Relatórios" />
        <ErrorMessage>Não foi possível carregar o fechamento: {mensagemDeErro(e)}</ErrorMessage>
      </div>
    );
  }
  const { atual, anterior } = dados;
  const resultado = atual.entradas - atual.saidas;
  const resultadoAnterior = anterior.entradas - anterior.saidas;
  const mg = margem(atual.vendas.lucro, atual.vendas.receita);
  const mgAnt = margem(anterior.vendas.lucro, anterior.vendas.receita);
  const nomeAnterior = nomeDoMes(anterior.mes);
  const semNada = atual.vendas.vendas === 0 && atual.entradas === 0 && atual.saidas === 0;
  const maiorCaixa = Math.max(atual.entradas, atual.saidas, 1);
  const maiorLucro = Math.max(atual.maisLucrativos[0]?.lucro ?? 0, 1);

  const comparacao: { rotulo: string; valor: string; antes: string; a: number; b: number; subirEhBom?: boolean }[] = [
    { rotulo: "Vendido", valor: formatBRL(atual.vendas.receita), antes: formatBRL(anterior.vendas.receita), a: atual.vendas.receita, b: anterior.vendas.receita },
    { rotulo: "Vendas feitas", valor: String(atual.vendas.vendas), antes: String(anterior.vendas.vendas), a: atual.vendas.vendas, b: anterior.vendas.vendas },
    { rotulo: "Ticket médio", valor: formatBRL(ticketMedio(atual.vendas)), antes: formatBRL(ticketMedio(anterior.vendas)), a: ticketMedio(atual.vendas), b: ticketMedio(anterior.vendas) },
    { rotulo: "Lucro", valor: formatBRL(atual.vendas.lucro), antes: formatBRL(anterior.vendas.lucro), a: atual.vendas.lucro, b: anterior.vendas.lucro },
    { rotulo: "Entrou no caixa", valor: formatBRL(atual.entradas), antes: formatBRL(anterior.entradas), a: atual.entradas, b: anterior.entradas },
    { rotulo: "Saiu do caixa", valor: formatBRL(atual.saidas), antes: formatBRL(anterior.saidas), a: atual.saidas, b: anterior.saidas, subirEhBom: false },
    { rotulo: "Resultado do caixa", valor: formatBRL(resultado), antes: formatBRL(resultadoAnterior), a: resultado, b: resultadoAnterior },
  ];

  return (
    <div>
      <PageHeader
        title="Relatórios"
        action={
          <a href={`/relatorios/fechamento/pdf?mes=${mes}`} className={btnSecondary}>
            Baixar PDF
          </a>
        }
      />
      <AbasRelatorios atual="fechamento" />

      <div className="mb-6">
        <SeletorPeriodo tipo="mes" mes={mes} basePath="/relatorios/fechamento" />
      </div>

      {semNada ? (
        <EmptyState
          ilustracao="grafico"
          title={`${nomeDoMes(mes)} sem movimento`}
          description="Nenhuma venda nem lançamento no caixa nesse mês. Escolha outro mês ou registre uma venda."
          action={
            <Link href="/vendas/novo" className={btnPrimary}>
              Nova venda
            </Link>
          }
        />
      ) : (
        <div className="graf-secoes flex flex-col gap-7">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
            <Kpi
              className="col-span-2"
              destaque
              rotulo="Faturamento"
              valor={formatBRL(atual.vendas.receita)}
                numero={{ v: atual.vendas.receita, tipo: "brl" }}
              atual={atual.vendas.receita}
              anterior={anterior.vendas.receita}
              antes={`Antes ${formatBRL(anterior.vendas.receita)}`}
            />
            <Kpi
              rotulo="Lucro"
              valor={formatBRL(atual.vendas.lucro)}
                numero={{ v: atual.vendas.lucro, tipo: "brl" }}
              tom={atual.vendas.lucro >= 0 ? "text-positive" : "text-danger"}
              atual={atual.vendas.lucro}
              anterior={anterior.vendas.lucro}
              antes={`Antes ${formatBRL(anterior.vendas.lucro)}`}
            />
            <Kpi rotulo="Margem" valor={formatPct(mg)} numero={{ v: mg, tipo: "pct" }} atual={mg} anterior={mgAnt} pontos antes={`Antes ${formatPct(mgAnt)}`} />
            <Kpi
              rotulo="Ticket médio"
              valor={formatBRL(ticketMedio(atual.vendas))}
              atual={ticketMedio(atual.vendas)}
              anterior={ticketMedio(anterior.vendas)}
              antes={`Antes ${formatBRL(ticketMedio(anterior.vendas))}`}
            />
            <Kpi rotulo="Vendas" valor={String(atual.vendas.vendas)} numero={{ v: atual.vendas.vendas, tipo: "int" }} atual={atual.vendas.vendas} anterior={anterior.vendas.vendas} antes={`Antes ${anterior.vendas.vendas}`} />
          </div>

          <Grupo titulo={`Dia a dia em ${nomeDoMes(mes)}`}>
            <GraficoEvolucao pontos={atual.dias} tituloTotal={nomeDoMes(mes)} />
          </Grupo>

          <div className="grid gap-7 lg:grid-cols-2">
            <Grupo titulo="Entradas e saídas do caixa" semPadding>
              <ul className="divide-y divide-line">
                <LinhaBarra
                  nome="Entrou"
                  tom="azul"
                  valor={formatBRL(atual.entradas)}
                  fracao={atual.entradas / maiorCaixa}
                  detalhe={
                    <>
                      <Variacao atual={atual.entradas} anterior={anterior.entradas} className="!px-1.5 !py-0" /> contra {nomeAnterior}
                    </>
                  }
                />
                <LinhaBarra
                  nome="Saiu"
                  valor={formatBRL(atual.saidas)}
                  fracao={atual.saidas / maiorCaixa}
                  detalhe={
                    <>
                      <Variacao atual={atual.saidas} anterior={anterior.saidas} subirEhBom={false} className="!px-1.5 !py-0" /> contra {nomeAnterior}
                    </>
                  }
                />
                <li className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="text-[15px] text-ink">{resultado >= 0 ? "Sobrou" : "Faltou"}</span>
                  <span className={`text-[17px] font-semibold tabular-nums ${resultado >= 0 ? "text-positive" : "text-danger"}`}>
                    {resultado >= 0 ? "↑" : "↓"} {formatBRL(Math.abs(resultado))}
                  </span>
                </li>
              </ul>
            </Grupo>

            <Grupo titulo="Gastos por categoria">
              {atual.gastos.length === 0 ? (
                <p className="text-[15px] text-ink-muted">Nenhuma saída de caixa nesse mês.</p>
              ) : (
                <Rosca
                  formatar={formatBRL}
                  centroRotulo="Saiu"
                  centroValor={formatBRL(atual.saidas)}
                  descricao={`Gastos por categoria, total ${formatBRL(atual.saidas)}`}
                  fatias={dobrarEmOutros(
                    atual.gastos.map((g) => ({
                      nome: g.categoria,
                      valor: g.valor,
                      detalhe: (
                        <Variacao atual={g.valor} anterior={anterior.gastos.find((a) => a.categoria === g.categoria)?.valor ?? 0} subirEhBom={false} className="!px-1.5 !py-0" />
                      ),
                    })),
                  )}
                />
              )}
            </Grupo>
          </div>

          {atual.maisLucrativos.length > 0 && (
            <Grupo titulo="Produtos que mais renderam" semPadding>
              <ul className="divide-y divide-line">
                {atual.maisLucrativos.map((p) => (
                  <LinhaBarra
                    key={p.id ?? p.nome}
                    inicio={<FotoProduto url={(p.id && capas.get(p.id)) || null} />}
                    nome={p.nome}
                    tom="verde"
                    valor={formatBRL(p.lucro)}
                    valorTom={p.lucro < 0 ? "text-danger" : "text-ink"}
                    fracao={Math.max(p.lucro, 0) / maiorLucro}
                    detalhe={`${p.quantidade} un · margem ${formatPct(p.margem)}`}
                  />
                ))}
              </ul>
            </Grupo>
          )}

          <Grupo
            titulo={`${nomeDoMes(mes)} contra ${nomeAnterior}`}
            semPadding
            rodape="Lucro é o vendido menos o custo dos produtos e os outros gastos das vendas. O caixa inclui também compras de estoque e lançamentos manuais."
          >
            <ul className="divide-y divide-line">
              {comparacao.map((l) => (
                <li key={l.rotulo} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[17px] text-ink">{l.rotulo}</p>
                    <p className="truncate text-[13px] text-ink-muted">Antes: {l.antes}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-0.5">
                    <p className="text-[17px] font-semibold tabular-nums text-ink">{l.valor}</p>
                    <Variacao atual={l.a} anterior={l.b} subirEhBom={l.subirEhBom} />
                  </div>
                </li>
              ))}
            </ul>
          </Grupo>
        </div>
      )}
    </div>
  );
}
