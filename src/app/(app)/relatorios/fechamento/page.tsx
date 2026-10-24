import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import { formatBRL, mesAtual, mesValido, nomeDoMes } from "@/lib/format";
import { mensagemDeErro } from "@/lib/action";
import { fechamentoDoMes } from "@/lib/fechamento";
import { formatPct, margem, ticketMedio } from "@/lib/relatorios";
import { capasDeProdutos } from "@/lib/relatorios-dados";
import { SeletorPeriodo } from "@/components/seletor-periodo";
import { Grupo, LinhaLink } from "@/components/ajustes";
import { ErrorMessage, PageHeader, btnPrimary, btnSecondary, EmptyState } from "@/components/ui";
import { GraficoEvolucao } from "@/components/graficos/evolucao";
import { LinhaBarra } from "@/components/graficos/barras";
import { Rosca, dobrarEmOutros } from "@/components/graficos/rosca";
import { Kpi } from "@/components/graficos/kpi";
import { Variacao } from "@/components/graficos/variacao";
import { FotoProduto } from "@/components/foto-produto";
import { AbasRelatorios } from "../abas";

export const metadata: Metadata = { title: "Fechamento do mês" };

const contas = (n: number) => `${n} ${n === 1 ? "conta" : "contas"}`;
const parcelas = (n: number) => `${n} ${n === 1 ? "parcela" : "parcelas"}`;

// uma linha da conta do "Sobrou": rótulo à esquerda, valor com sinal à direita
function LinhaConta({ rotulo, detalhe, valor, sinal, forte = false, tom = "text-ink" }: { rotulo: string; detalhe?: ReactNode; valor: number; sinal?: "+" | "−"; forte?: boolean; tom?: string }) {
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className={`truncate text-[17px] text-ink ${forte ? "font-semibold" : ""}`}>{rotulo}</p>
        {detalhe && <p className="truncate text-[13px] text-ink-muted">{detalhe}</p>}
      </div>
      <p className={`shrink-0 tabular-nums ${forte ? "text-[17px] font-semibold" : "text-[17px]"} ${tom}`}>
        {sinal ? `${sinal} ` : ""}
        {formatBRL(Math.abs(valor))}
      </p>
    </li>
  );
}

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
  const { atual, anterior, seguinte } = dados;
  const resultado = atual.entradas - atual.saidas;
  const resultadoAnterior = anterior.entradas - anterior.saidas;
  const mg = margem(atual.vendas.lucro, atual.vendas.receita);
  const mgAnt = margem(anterior.vendas.lucro, anterior.vendas.receita);
  const nomeAnterior = nomeDoMes(anterior.mes);
  const nomeSeguinte = nomeDoMes(seguinte.mes);
  const semNada = atual.vendas.vendas === 0 && atual.entradas === 0 && atual.saidas === 0;
  const maiorCaixa = Math.max(atual.entradas, atual.saidas, 1);
  const maiorLucro = Math.max(atual.maisLucrativos[0]?.lucro ?? 0, 1);
  const sobrouTom = atual.sobrou >= 0 ? "text-positive" : "text-danger";

  const comparacao: { rotulo: string; valor: string; antes: string; a: number; b: number; subirEhBom?: boolean }[] = [
    { rotulo: "Sobrou", valor: formatBRL(atual.sobrou), antes: formatBRL(anterior.sobrou), a: atual.sobrou, b: anterior.sobrou },
    { rotulo: "Vendido", valor: formatBRL(atual.vendas.receita), antes: formatBRL(anterior.vendas.receita), a: atual.vendas.receita, b: anterior.vendas.receita },
    { rotulo: "Vendas feitas", valor: String(atual.vendas.vendas), antes: String(anterior.vendas.vendas), a: atual.vendas.vendas, b: anterior.vendas.vendas },
    { rotulo: "Ticket médio", valor: formatBRL(ticketMedio(atual.vendas)), antes: formatBRL(ticketMedio(anterior.vendas)), a: ticketMedio(atual.vendas), b: ticketMedio(anterior.vendas) },
    { rotulo: "Lucro das vendas", valor: formatBRL(atual.vendas.lucro), antes: formatBRL(anterior.vendas.lucro), a: atual.vendas.lucro, b: anterior.vendas.lucro },
    { rotulo: "Despesas", valor: formatBRL(atual.despesas), antes: formatBRL(anterior.despesas), a: atual.despesas, b: anterior.despesas, subirEhBom: false },
    { rotulo: "Comprou de estoque", valor: formatBRL(atual.compras), antes: formatBRL(anterior.compras), a: atual.compras, b: anterior.compras },
    { rotulo: "Entrou no caixa", valor: formatBRL(atual.entradas), antes: formatBRL(anterior.entradas), a: atual.entradas, b: anterior.entradas },
    { rotulo: "Saiu do caixa", valor: formatBRL(atual.saidas), antes: formatBRL(anterior.saidas), a: atual.saidas, b: anterior.saidas, subirEhBom: false },
    { rotulo: "Resultado do caixa", valor: formatBRL(resultado), antes: formatBRL(resultadoAnterior), a: resultado, b: resultadoAnterior },
  ];

  // detalhe das saídas do caixa: só o que teve valor
  const saidas: { nome: string; valor: number; detalhe?: string }[] = [
    { nome: "Despesas", valor: atual.despesas },
    { nome: "Comprou de estoque", valor: atual.compras, detalhe: `${atual.comprasQtd} ${atual.comprasQtd === 1 ? "compra" : "compras"}` },
    { nome: "Gastos e estornos das vendas", valor: atual.saidasDasVendas },
    { nome: "Retiradas", valor: atual.retiradas },
  ].filter((s) => s.valor > 0);

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
              rotulo={atual.sobrou >= 0 ? "Sobrou no mês" : "Faltou no mês"}
              valor={formatBRL(atual.sobrou)}
              numero={{ v: atual.sobrou, tipo: "brl" }}
              tom={sobrouTom}
              atual={atual.sobrou}
              anterior={anterior.sobrou}
              antes={`Antes ${formatBRL(anterior.sobrou)}`}
            />
            <Kpi
              rotulo="Faturamento"
              valor={formatBRL(atual.vendas.receita)}
              numero={{ v: atual.vendas.receita, tipo: "brl" }}
              atual={atual.vendas.receita}
              anterior={anterior.vendas.receita}
              antes={`Antes ${formatBRL(anterior.vendas.receita)}`}
            />
            <Kpi
              rotulo="Lucro das vendas"
              valor={formatBRL(atual.vendas.lucro)}
              numero={{ v: atual.vendas.lucro, tipo: "brl" }}
              tom={atual.vendas.lucro >= 0 ? "text-ink" : "text-danger"}
              atual={atual.vendas.lucro}
              anterior={anterior.vendas.lucro}
              antes={`Antes ${formatBRL(anterior.vendas.lucro)}`}
            />
            <Kpi rotulo="Margem" valor={formatPct(mg)} numero={{ v: mg, tipo: "pct" }} atual={mg} anterior={mgAnt} pontos antes={`Antes ${formatPct(mgAnt)}`} />
            <Kpi rotulo="Vendas" valor={String(atual.vendas.vendas)} numero={{ v: atual.vendas.vendas, tipo: "int" }} atual={atual.vendas.vendas} anterior={anterior.vendas.vendas} antes={`Antes ${anterior.vendas.vendas}`} />
          </div>

          <Grupo
            titulo={`A conta de ${nomeDoMes(mes)}`}
            semPadding
            rodape="Compra de estoque não é despesa: é dinheiro que virou produto. O custo dele entra no lucro quando o produto for vendido."
          >
            <ul className="divide-y divide-line">
              <LinhaConta rotulo="Vendas" detalhe={`${atual.vendas.vendas} ${atual.vendas.vendas === 1 ? "venda" : "vendas"}`} valor={atual.vendas.receita} />
              <LinhaConta rotulo="Custo das mercadorias" valor={atual.custoMercadorias} sinal="−" />
              {atual.gastosDasVendas > 0 && <LinhaConta rotulo="Gastos das vendas" detalhe="Motoboy, embalagem e afins" valor={atual.gastosDasVendas} sinal="−" />}
              <LinhaConta rotulo="Lucro das vendas" valor={atual.vendas.lucro} sinal={atual.vendas.lucro < 0 ? "−" : undefined} forte />
              <LinhaConta rotulo="Despesas" detalhe="Contas pagas e saídas lançadas no caixa" valor={atual.despesas} sinal="−" />
              <LinhaConta
                rotulo={atual.sobrou >= 0 ? "Sobrou" : "Faltou"}
                detalhe={
                  <>
                    <Variacao atual={atual.sobrou} anterior={anterior.sobrou} className="!px-1.5 !py-0" /> contra {nomeAnterior}
                  </>
                }
                valor={atual.sobrou}
                sinal={atual.sobrou < 0 ? "−" : undefined}
                forte
                tom={sobrouTom}
              />
              <LinhaConta rotulo="Comprou de estoque" detalhe="À parte: virou produto na prateleira" valor={atual.compras} tom="text-ink-muted" />
            </ul>
          </Grupo>

          <Grupo titulo={`Dia a dia em ${nomeDoMes(mes)}`}>
            <GraficoEvolucao pontos={atual.dias} tituloTotal={nomeDoMes(mes)} />
          </Grupo>

          <div className="grid gap-7 lg:grid-cols-2">
            <Grupo titulo="Despesas por categoria">
              {atual.gastos.length === 0 ? (
                <p className="text-[15px] text-ink-muted">Nenhuma despesa nesse mês.</p>
              ) : (
                <Rosca
                  formatar={formatBRL}
                  centroRotulo="Despesas"
                  centroValor={formatBRL(atual.despesas)}
                  descricao={`Despesas por categoria, total ${formatBRL(atual.despesas)}`}
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
                {saidas.map((s) => (
                  <li key={s.nome} className="flex items-center justify-between gap-3 py-2.5 pl-8 pr-4">
                    <span className="min-w-0 truncate text-[15px] text-ink-muted">
                      {s.nome}
                      {s.detalhe ? ` · ${s.detalhe}` : ""}
                    </span>
                    <span className="shrink-0 text-[15px] tabular-nums text-ink-muted">{formatBRL(s.valor)}</span>
                  </li>
                ))}
                <li className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="text-[15px] text-ink">Resultado do caixa</span>
                  <span className={`text-[17px] font-semibold tabular-nums ${resultado >= 0 ? "text-positive" : "text-danger"}`}>
                    {resultado >= 0 ? "↑" : "↓"} {formatBRL(Math.abs(resultado))}
                  </span>
                </li>
              </ul>
            </Grupo>
          </div>

          <Grupo titulo={`Olhando pra ${nomeSeguinte}`} semPadding rodape="A pagar e a receber: o que está em aberto hoje com vencimento no mês. Estoque pelo custo dos produtos.">
            <LinhaLink
              href="/contas-a-pagar"
              rotulo={
                <>
                  A pagar <span className="text-[13px] text-ink-muted">· {contas(seguinte.aPagar.quantidade)}</span>
                </>
              }
              detalhe={formatBRL(seguinte.aPagar.total)}
            />
            <LinhaLink
              href="/contas-a-receber"
              rotulo={
                <>
                  A receber <span className="text-[13px] text-ink-muted">· {parcelas(seguinte.aReceber.quantidade)}</span>
                </>
              }
              detalhe={formatBRL(seguinte.aReceber.total)}
            />
            <LinhaLink href="/produtos" rotulo="Estoque hoje" detalhe={formatBRL(seguinte.estoqueHoje)} />
          </Grupo>

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
            rodape="Lucro das vendas é o vendido menos o custo dos produtos e os gastos das vendas. Sobrou é esse lucro menos as despesas do mês."
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
