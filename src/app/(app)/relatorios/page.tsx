import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatBRL } from "@/lib/format";
import { mensagemDeErro } from "@/lib/action";
import { formatPct, hrefRelatorio, margem, resolverPeriodoRelatorio, ticketMedio } from "@/lib/relatorios";
import { carregarRelatorio, type ProdutoVendido } from "@/lib/relatorios-dados";
import { Grupo } from "@/components/ajustes";
import { Badge, ErrorMessage, PageHeader, btnPrimary, btnSecondary } from "@/components/ui";
import { GraficoEvolucao } from "@/components/graficos/evolucao";
import { LinhaBarra } from "@/components/graficos/barras";
import { BarraEmpilhada, Rosca, dobrarEmOutros } from "@/components/graficos/rosca";
import { Kpi } from "@/components/graficos/kpi";
import { Variacao } from "@/components/graficos/variacao";
import { EstadoVazio } from "@/components/graficos/vazio";
import { FotoProduto } from "@/components/foto-produto";
import { AbasRelatorios } from "./abas";
import { SeletorPeriodo } from "./seletor-periodo";
import { LinhaCliente, detalheCompras, detalheSumido } from "./clientes-secao";

export const metadata: Metadata = { title: "Relatórios" };

function VerTodos({ href, children }: { href: string; children: string }) {
  return (
    <Link href={href} className="flex items-center justify-between border-t border-line px-4 py-3 text-[15px] font-medium text-brand-text transition hover:bg-fill/60">
      {children}
      <span aria-hidden="true">›</span>
    </Link>
  );
}

function Mensagem({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-4 text-[15px] text-ink-muted">{children}</p>;
}

export default async function RelatoriosPage({ searchParams }: PageProps<"/relatorios">) {
  const sp = await searchParams;
  const texto = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
  const periodo = resolverPeriodoRelatorio({ p: texto(sp.p), de: texto(sp.de), ate: texto(sp.ate) });

  const supabase = await createClient();
  let d;
  try {
    d = await carregarRelatorio(supabase, periodo);
  } catch (e) {
    return (
      <div>
        <PageHeader title="Relatórios" />
        <ErrorMessage>Não foi possível carregar o relatório: {mensagemDeErro(e)}</ErrorMessage>
      </div>
    );
  }

  const { totais, totaisAnteriores: ant } = d;
  const mg = margem(totais.lucro, totais.receita);
  const mgAnt = margem(ant.lucro, ant.receita);
  const capa = (p: ProdutoVendido) => <FotoProduto url={(p.id && d.capas.get(p.id)) || null} />;
  const verTodos = (ordem: string) => hrefRelatorio("/relatorios/produtos", periodo, { ordem });
  const semVendas = d.vendas.length === 0;
  const entradasESaidas = d.caixa.entradas > 0 || d.caixa.saidas > 0;
  const maiorCaixa = Math.max(d.caixa.entradas, d.caixa.saidas, 1);
  const resultado = d.caixa.entradas - d.caixa.saidas;
  const maiorMargemCanal = Math.max(...d.canais.map((c) => Math.abs(c.margem)), 1);
  const totalParado = d.parado.total;
  const maiorFaixa = Math.max(...d.parado.faixas.map((f) => f.valor), 1);
  const { noPeriodo: np } = d.clientes;

  return (
    <div>
      <PageHeader title="Relatórios" />
      <AbasRelatorios atual="resumo" periodo={periodo} />

      <div className="mb-6">
        <SeletorPeriodo periodo={periodo} basePath="/relatorios" />
      </div>

      <div className="graf-secoes flex flex-col gap-7">
        {semVendas ? (
          <EstadoVazio
            titulo="Nenhuma venda nesse período"
            texto="Registre uma venda ou escolha outro período para ver os números e os gráficos aparecerem aqui."
            acoes={
              <>
                <Link href="/vendas/novo" className={btnPrimary}>
                  Nova venda
                </Link>
                {periodo.chave !== "ano" && (
                  <Link href="/relatorios?p=ano" replace className={btnSecondary}>
                    Ver o ano todo
                  </Link>
                )}
              </>
            }
          />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
              <Kpi
                className="col-span-2"
                destaque
                rotulo="Faturamento"
                valor={formatBRL(totais.receita)}
                numero={{ v: totais.receita, tipo: "brl" }}
                atual={totais.receita}
                anterior={ant.receita}
                antes={`Antes ${formatBRL(ant.receita)}`}
              />
              <Kpi
                rotulo="Lucro"
                valor={formatBRL(totais.lucro)}
                numero={{ v: totais.lucro, tipo: "brl" }}
                tom={totais.lucro >= 0 ? "text-positive" : "text-danger"}
                atual={totais.lucro}
                anterior={ant.lucro}
                antes={`Antes ${formatBRL(ant.lucro)}`}
              />
              <Kpi rotulo="Margem" valor={formatPct(mg)} numero={{ v: mg, tipo: "pct" }} atual={mg} anterior={mgAnt} pontos antes={`Antes ${formatPct(mgAnt)}`} />
              <Kpi rotulo="Ticket médio" valor={formatBRL(ticketMedio(totais))} atual={ticketMedio(totais)} anterior={ticketMedio(ant)} antes={`Antes ${formatBRL(ticketMedio(ant))}`} />
              <Kpi
                rotulo="Vendas"
                valor={String(totais.vendas)} numero={{ v: totais.vendas, tipo: "int" }}
                atual={totais.vendas}
                anterior={ant.vendas}
                antes={`Antes ${ant.vendas}`}
              />
            </div>

            <Grupo titulo="Evolução">
              <GraficoEvolucao pontos={d.serie.pontos} tituloTotal={periodo.rotulo} />
            </Grupo>

            <div className="grid gap-7 lg:grid-cols-2">
              <Grupo titulo="Mais vendidos" semPadding>
                <ul className="divide-y divide-line">
                  {d.maisVendidos.map((p) => (
                    <LinhaBarra
                      key={p.id ?? p.nome}
                      inicio={capa(p)}
                      nome={p.nome}
                      valor={`${p.quantidade} un`}
                      fracao={p.quantidade / d.maisVendidos[0].quantidade}
                      detalhe={`${formatBRL(p.receita)} · lucro ${formatBRL(p.lucro)}`}
                    />
                  ))}
                </ul>
                <VerTodos href={verTodos("vendidos")}>Ver todos</VerTodos>
              </Grupo>

              <Grupo titulo="Mais lucrativos" semPadding>
                <ul className="divide-y divide-line">
                  {d.maisLucrativos.map((p) => (
                    <LinhaBarra
                      key={p.id ?? p.nome}
                      inicio={capa(p)}
                      nome={p.nome}
                      tom="verde"
                      valor={formatBRL(p.lucro)}
                      valorTom={p.lucro < 0 ? "text-danger" : "text-ink"}
                      fracao={Math.max(p.lucro, 0) / Math.max(d.maisLucrativos[0].lucro, 1)}
                      detalhe={`${p.quantidade} un · margem ${formatPct(p.margem)}`}
                    />
                  ))}
                </ul>
                <VerTodos href={verTodos("lucro")}>Ver todos</VerTodos>
              </Grupo>
            </div>

            <div className="grid gap-7 lg:grid-cols-2">
              <Grupo titulo="Margem por canal" semPadding rodape="Já desconta os outros gastos das vendas, como motoboy e embalagem.">
                <ul className="divide-y divide-line">
                  {d.canais.map((c) => (
                    <LinhaBarra
                      key={c.nome}
                      nome={c.nome}
                      tom={c.margem < 0 ? "perigo" : "azul"}
                      valor={formatPct(c.margem)}
                      valorTom={c.margem < 0 ? "text-danger" : "text-ink"}
                      fracao={Math.abs(c.margem) / maiorMargemCanal}
                      detalhe={`${c.vendas} ${c.vendas === 1 ? "venda" : "vendas"} · ${formatBRL(c.receita)} · lucro ${formatBRL(c.lucro)}`}
                    />
                  ))}
                </ul>
              </Grupo>

              <Grupo titulo="Forma de pagamento">
                <BarraEmpilhada
                  formatar={formatBRL}
                  fatias={dobrarEmOutros(
                    d.pagamentos.map((p) => ({ nome: p.nome, valor: p.receita, detalhe: `${p.vendas} ${p.vendas === 1 ? "venda" : "vendas"}` })),
                    5,
                  )}
                />
              </Grupo>
            </div>
          </>
        )}

        {(entradasESaidas || d.caixa.gastos.length > 0) && (
          <div className="grid gap-7 lg:grid-cols-2">
            <Grupo titulo="Gastos por categoria">
              {d.caixa.gastos.length === 0 ? (
                <p className="text-[15px] text-ink-muted">Nenhuma saída de caixa nesse período.</p>
              ) : (
                <Rosca
                  formatar={formatBRL}
                  centroRotulo="Saiu"
                  centroValor={formatBRL(d.caixa.saidas)}
                  descricao={`Gastos por categoria, total ${formatBRL(d.caixa.saidas)}`}
                  fatias={dobrarEmOutros(
                    d.caixa.gastos.map((g) => ({
                      nome: g.categoria,
                      valor: g.valor,
                      detalhe: (
                        <Variacao
                          atual={g.valor}
                          anterior={d.caixaAnterior.gastos.find((a) => a.categoria === g.categoria)?.valor ?? 0}
                          subirEhBom={false}
                          className="!px-1.5 !py-0"
                        />
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
                  valor={formatBRL(d.caixa.entradas)}
                  fracao={d.caixa.entradas / maiorCaixa}
                  detalhe={<Variacao atual={d.caixa.entradas} anterior={d.caixaAnterior.entradas} className="!px-1.5 !py-0" />}
                />
                <LinhaBarra
                  nome="Saiu"
                  valor={formatBRL(d.caixa.saidas)}
                  fracao={d.caixa.saidas / maiorCaixa}
                  detalhe={<Variacao atual={d.caixa.saidas} anterior={d.caixaAnterior.saidas} subirEhBom={false} className="!px-1.5 !py-0" />}
                />
                <li className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="text-[15px] text-ink">{resultado >= 0 ? "Sobrou" : "Faltou"}</span>
                  <span className={`text-[17px] font-semibold tabular-nums ${resultado >= 0 ? "text-positive" : "text-danger"}`}>
                    {resultado >= 0 ? "↑" : "↓"} {formatBRL(Math.abs(resultado))}
                  </span>
                </li>
              </ul>
            </Grupo>
          </div>
        )}

        <div className="grid gap-7 lg:grid-cols-2">
          <Grupo titulo="Dinheiro parado" semPadding rodape="Estoque a custo de produtos que não vendem faz tempo.">
            {totalParado === 0 ? (
              <Mensagem>Nada parado há mais de 30 dias. Tudo girando.</Mensagem>
            ) : (
              <>
                <div className="px-4 pt-4">
                  <p className="text-[13px] text-ink-muted">Parado há 30 dias ou mais</p>
                  <p className="text-[28px] font-bold leading-tight tracking-tight tabular-nums text-ink">{formatBRL(totalParado)}</p>
                </div>
                <ul className="divide-y divide-line">
                  {d.parado.faixas.map((f) => (
                    <LinhaBarra
                      key={f.de}
                      nome={f.rotulo}
                      tom="alerta"
                      valor={formatBRL(f.valor)}
                      fracao={f.valor / maiorFaixa}
                      detalhe={`${f.produtos} ${f.produtos === 1 ? "produto" : "produtos"}`}
                    />
                  ))}
                </ul>
                <p className="border-t border-line px-4 pb-1 pt-3 text-[13px] uppercase text-ink-muted">Os que mais prendem dinheiro</p>
                <ul className="divide-y divide-line">
                  {d.parado.maiores.map((p) => (
                    <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                      <FotoProduto url={d.capas.get(p.id) ?? null} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] text-ink">{p.nome}</p>
                        <p className="truncate text-[13px] text-ink-muted">
                          {p.estoque} em estoque · parado há {p.dias} dias
                        </p>
                      </div>
                      <p className="shrink-0 text-[15px] font-semibold tabular-nums text-ink">{formatBRL(p.valor)}</p>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Grupo>

          <Grupo titulo="Margem baixa" semPadding rodape="Produtos vendidos no período com lucro abaixo de 15% do valor, ou no prejuízo.">
            {d.margemBaixa.length === 0 ? (
              <Mensagem>Nenhum produto com margem baixa nesse período. Bom sinal.</Mensagem>
            ) : (
              <ul className="divide-y divide-line">
                {d.margemBaixa.map((p) => (
                  <li key={p.id ?? p.nome} className="flex items-center gap-3 px-4 py-3">
                    {capa(p)}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] text-ink">{p.nome}</p>
                      <p className="truncate text-[13px] text-ink-muted">
                        {p.quantidade} un · lucro {formatBRL(p.lucro)}
                      </p>
                    </div>
                    <Badge tone={p.margem < 0 ? "negative" : "warning"}>{p.margem < 0 ? `Prejuízo ${formatPct(Math.abs(p.margem))}` : `Margem ${formatPct(p.margem)}`}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Grupo>
        </div>

        <div className="flex flex-col gap-7">
          <div className="grid gap-7 lg:grid-cols-2">
            <Grupo titulo="Clientes no período">
              {np.novos + np.recorrentes === 0 ? (
                <p className="text-[15px] text-ink-muted">Nenhum cliente cadastrado comprou nesse período.</p>
              ) : (
                <BarraEmpilhada
                  formatar={(v) => `${v} ${v === 1 ? "cliente" : "clientes"}`}
                  fatias={[
                    { nome: "Novos", valor: np.novos, detalhe: `${formatBRL(np.receitaNovos)} comprados` },
                    { nome: "Voltaram a comprar", valor: np.recorrentes, detalhe: `${formatBRL(np.receitaRecorrentes)} comprados` },
                  ]}
                />
              )}
            </Grupo>

            <Grupo titulo="Quem mais comprou" semPadding>
              {np.melhores.length === 0 ? (
                <Mensagem>Ninguém comprou com cadastro nesse período.</Mensagem>
              ) : (
                <ul className="divide-y divide-line">
                  {np.melhores.map((c) => (
                    <LinhaCliente key={c.id} c={c} detalhe={detalheCompras(c)} />
                  ))}
                </ul>
              )}
            </Grupo>
          </div>

          <Grupo titulo={`Sumiram há ${d.clientes.diasSumido} dias`} semPadding rodape="O botão abre o WhatsApp com a mensagem pronta, que você pode mudar antes de enviar.">
            {d.clientes.sumidos.length === 0 ? (
              <Mensagem>Ninguém sumiu. Todo mundo comprou nos últimos {d.clientes.diasSumido} dias.</Mensagem>
            ) : (
              <>
                <ul className="divide-y divide-line">
                  {d.clientes.sumidos.slice(0, 5).map((c) => (
                    <LinhaCliente key={c.id} c={c} detalhe={detalheSumido(c)} comZap />
                  ))}
                </ul>
                <VerTodos href="/clientes/insights">{d.clientes.sumidos.length > 5 ? `Ver todos os ${d.clientes.sumidos.length}` : "Ver todos os clientes"}</VerTodos>
              </>
            )}
          </Grupo>
        </div>
      </div>
    </div>
  );
}
