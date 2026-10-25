import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatBRL } from "@/lib/format";
import { mensagemDeErro } from "@/lib/action";
import { resolverPeriodoRelatorio } from "@/lib/relatorios";
import { analiseClientes } from "@/lib/relatorios-dados";
import { Grupo } from "@/components/ajustes";
import { PageHeader, ErrorMessage, Segmentos, StatCard, btnPrimary, EmptyState } from "@/components/ui";
import { BarraEmpilhada } from "@/components/graficos/rosca";
import { SeletorPeriodo } from "@/components/seletor-periodo";
import { LinhaCliente, detalheCompras, detalheSumido } from "../../relatorios/clientes-secao";

export const metadata: Metadata = { title: "Clientes: análises" };

export default async function ClientesAnalisesPage({ searchParams }: PageProps<"/clientes/insights">) {
  const sp = await searchParams;
  const texto = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
  const periodo = resolverPeriodoRelatorio({ p: texto(sp.p), de: texto(sp.de), ate: texto(sp.ate) });

  const supabase = await createClient();
  let a;
  try {
    a = await analiseClientes(supabase, periodo);
  } catch (e) {
    return (
      <div>
        <PageHeader title="Clientes" />
        <ErrorMessage>Não foi possível carregar os clientes: {mensagemDeErro(e)}</ErrorMessage>
      </div>
    );
  }
  const np = a.noPeriodo;

  return (
    <div>
      <PageHeader title="Clientes" />
      <Segmentos
        rotulo="Clientes"
        substituir={false}
        className="mb-6 w-full sm:w-80"
        itens={[
          { href: "/clientes", label: "Lista", ativo: false },
          { href: "/clientes/insights", label: "Análises", ativo: true },
        ]}
      />

      {a.compradores === 0 ? (
        <EmptyState
          ilustracao="grafico"
          title="Ainda sem compras de clientes"
          description="Quando você registrar vendas com um cliente cadastrado, aqui aparece quem mais compra e quem sumiu."
          action={
            <Link href="/vendas/novo" className={btnPrimary}>
              Nova venda
            </Link>
          }
        />
      ) : (
        <div className="flex flex-col gap-7">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Já compraram" value={String(a.compradores)} hint="Clientes com alguma compra" />
            <StatCard label="Novos" value={String(np.novos)} tone="positive" hint={`${formatBRL(np.receitaNovos)} no período`} />
            <StatCard label="Clientes que voltaram" value={String(np.recorrentes)} hint={`${formatBRL(np.receitaRecorrentes)} no período`} />
            <StatCard label={`Sumidos há ${a.diasSumido} dias`} value={String(a.sumidos.length)} tone={a.sumidos.length > 0 ? "warning" : "neutral"} hint="Para chamar de volta" />
          </div>

          <div className="flex flex-col gap-3">
            <SeletorPeriodo tipo="relatorio" periodo={periodo} basePath="/clientes/insights" />
            <Grupo titulo="Novos e clientes que voltaram">
              {np.novos + np.recorrentes === 0 ? (
                <p className="text-[15px] text-ink-muted">Nenhum cliente cadastrado comprou nesse período.</p>
              ) : (
                <BarraEmpilhada
                  formatar={(v) => `${v} ${v === 1 ? "cliente" : "clientes"}`}
                  fatias={[
                    { nome: "Novos", valor: np.novos, detalhe: `${formatBRL(np.receitaNovos)} comprados` },
                    { nome: "Clientes que voltaram", valor: np.recorrentes, detalhe: `${formatBRL(np.receitaRecorrentes)} comprados` },
                  ]}
                />
              )}
            </Grupo>
          </div>

          <Grupo
            titulo={`Sumiram há ${a.diasSumido} dias ou mais`}
            semPadding
            rodape="Quem mais comprou aparece primeiro. O botão abre o WhatsApp com uma mensagem pronta, que você pode mudar antes de enviar."
          >
            {a.sumidos.length === 0 ? (
              <p className="px-4 py-4 text-[15px] text-ink-muted">Ninguém sumiu. Todo mundo comprou nos últimos {a.diasSumido} dias.</p>
            ) : (
              <ul className="divide-y divide-line">
                {a.sumidos.map((c) => (
                  <LinhaCliente key={c.id} c={c} detalhe={`${detalheSumido(c)} · ${c.compras} ${c.compras === 1 ? "compra" : "compras"}`} comZap />
                ))}
              </ul>
            )}
          </Grupo>

          <Grupo titulo="Quem mais compra" semPadding rodape="Total comprado desde o começo, sem contar vendas canceladas.">
            <ul className="divide-y divide-line">
              {a.melhoresDeSempre.map((c) => (
                <LinhaCliente key={c.id} c={c} detalhe={detalheCompras(c)} />
              ))}
            </ul>
          </Grupo>
        </div>
      )}
    </div>
  );
}
