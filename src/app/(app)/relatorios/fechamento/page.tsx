import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { formatBRL, mesAtual, mesValido, nomeDoMes } from "@/lib/format";
import { mensagemDeErro } from "@/lib/action";
import { fechamentoDoMes } from "@/lib/fechamento";
import { formatPct, margem, variacao } from "@/lib/relatorios";
import { MonthPicker } from "@/components/month-picker";
import { Grupo } from "@/components/ajustes";
import { ErrorMessage, PageHeader, StatCard, btnSecondary } from "@/components/ui";
import { AbasRelatorios } from "../abas";

export const metadata: Metadata = { title: "Fechamento do mês" };

// quando "subir" é bom (vendas, lucro) ou ruim (gastos)
function Variacao({ atual, anterior, subirEhBom = true }: { atual: number; anterior: number; subirEhBom?: boolean }) {
  const v = variacao(atual, anterior);
  if (v === null) return <span className="text-ink-faint">sem base</span>;
  if (Math.abs(v) < 0.05) return <span className="text-ink-muted">igual</span>;
  const bom = v > 0 === subirEhBom;
  return (
    <span className={bom ? "text-positive" : "text-danger"}>
      {v > 0 ? "↑" : "↓"} {formatPct(Math.abs(v))}
    </span>
  );
}

export default async function FechamentoPage({ searchParams }: PageProps<"/relatorios/fechamento">) {
  const sp = await searchParams;
  const mes = mesValido(typeof sp.mes === "string" ? sp.mes : undefined) ?? mesAtual();

  const supabase = await createClient();
  let dados;
  try {
    dados = await fechamentoDoMes(supabase, mes);
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
  const ticket = atual.vendas.vendas > 0 ? atual.vendas.receita / atual.vendas.vendas : 0;
  const ticketAnterior = anterior.vendas.vendas > 0 ? anterior.vendas.receita / anterior.vendas.vendas : 0;
  const totalGastos = atual.gastos.reduce((s, g) => s + g.valor, 0);

  const linhas: { rotulo: string; atual: string; anterior: string; a: number; b: number; subirEhBom?: boolean }[] = [
    { rotulo: "Vendido", atual: formatBRL(atual.vendas.receita), anterior: formatBRL(anterior.vendas.receita), a: atual.vendas.receita, b: anterior.vendas.receita },
    { rotulo: "Vendas feitas", atual: String(atual.vendas.vendas), anterior: String(anterior.vendas.vendas), a: atual.vendas.vendas, b: anterior.vendas.vendas },
    { rotulo: "Ticket médio", atual: formatBRL(ticket), anterior: formatBRL(ticketAnterior), a: ticket, b: ticketAnterior },
    { rotulo: "Lucro", atual: formatBRL(atual.vendas.lucro), anterior: formatBRL(anterior.vendas.lucro), a: atual.vendas.lucro, b: anterior.vendas.lucro },
    { rotulo: "Entrou no caixa", atual: formatBRL(atual.entradas), anterior: formatBRL(anterior.entradas), a: atual.entradas, b: anterior.entradas },
    { rotulo: "Saiu do caixa", atual: formatBRL(atual.saidas), anterior: formatBRL(anterior.saidas), a: atual.saidas, b: anterior.saidas, subirEhBom: false },
    { rotulo: "Resultado do caixa", atual: formatBRL(resultado), anterior: formatBRL(resultadoAnterior), a: resultado, b: resultadoAnterior },
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
        <MonthPicker mes={mes} basePath="/relatorios/fechamento" />
      </div>

      <div className="flex flex-col gap-7">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Vendido" value={formatBRL(atual.vendas.receita)} hint={`${atual.vendas.vendas} ${atual.vendas.vendas === 1 ? "venda" : "vendas"}`} />
          <StatCard
            label="Lucro"
            value={formatBRL(atual.vendas.lucro)}
            tone={atual.vendas.lucro >= 0 ? "positive" : "negative"}
            hint={`Margem ${formatPct(margem(atual.vendas.lucro, atual.vendas.receita))}`}
          />
          <StatCard label="Entrou" value={formatBRL(atual.entradas)} tone="positive" />
          <StatCard label="Saiu" value={formatBRL(atual.saidas)} tone="negative" />
        </div>

        <Grupo
          titulo={`${nomeDoMes(mes)} contra ${nomeDoMes(anterior.mes)}`}
          semPadding
          rodape="Lucro é o vendido menos o custo dos produtos e os outros gastos das vendas. O caixa inclui também compras de estoque e lançamentos manuais."
        >
          <ul className="divide-y divide-line">
            {linhas.map((l) => (
              <li key={l.rotulo} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[17px] text-ink">{l.rotulo}</p>
                  <p className="truncate text-[13px] text-ink-muted">Antes: {l.anterior}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[17px] font-semibold tabular-nums text-ink">{l.atual}</p>
                  <p className="text-[13px] tabular-nums">
                    <Variacao atual={l.a} anterior={l.b} subirEhBom={l.subirEhBom} />
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Grupo>

        <Grupo titulo="Gastos por categoria" semPadding>
          {atual.gastos.length === 0 ? (
            <p className="px-4 py-3 text-[15px] text-ink-muted">Nenhuma saída de caixa nesse mês.</p>
          ) : (
            <ul className="divide-y divide-line">
              {atual.gastos.map((g) => {
                const antes = anterior.gastos.find((a) => a.categoria === g.categoria)?.valor ?? 0;
                return (
                  <li key={g.categoria} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[17px] text-ink">{g.categoria}</p>
                      <p className="truncate text-[13px] text-ink-muted">
                        {formatPct(totalGastos > 0 ? (g.valor / totalGastos) * 100 : 0)} dos gastos · antes {formatBRL(antes)}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[17px] font-semibold tabular-nums text-ink">{formatBRL(g.valor)}</p>
                      <p className="text-[13px] tabular-nums">
                        <Variacao atual={g.valor} anterior={antes} subirEhBom={false} />
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Grupo>
      </div>
    </div>
  );
}
