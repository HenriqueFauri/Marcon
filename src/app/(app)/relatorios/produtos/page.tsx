import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatBRL } from "@/lib/format";
import { mensagemDeErro } from "@/lib/action";
import { formatPct, hrefRelatorio, resolverPeriodoRelatorio } from "@/lib/relatorios";
import { capasDeProdutos, ordenarProdutos, produtosVendidos, type OrdemProdutos } from "@/lib/relatorios-dados";
import { Grupo } from "@/components/ajustes";
import { ErrorMessage, PageHeader, Segmentos, btnPrimary } from "@/components/ui";
import { LinhaBarra } from "@/components/graficos/barras";
import { EstadoVazio } from "@/components/graficos/vazio";
import { FotoProduto } from "@/components/foto-produto";
import { AbasRelatorios } from "../abas";
import { SeletorPeriodo } from "../seletor-periodo";

export const metadata: Metadata = { title: "Produtos: relatórios" };

const LIMITE = 50;
const ORDENS: { valor: OrdemProdutos; label: string }[] = [
  { valor: "vendidos", label: "Mais vendidos" },
  { valor: "lucro", label: "Mais lucrativos" },
  { valor: "margem", label: "Maior margem" },
];

export default async function RelatorioProdutosPage({ searchParams }: PageProps<"/relatorios/produtos">) {
  const sp = await searchParams;
  const texto = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
  const periodo = resolverPeriodoRelatorio({ p: texto(sp.p), de: texto(sp.de), ate: texto(sp.ate) });
  const ordem: OrdemProdutos = ORDENS.find((o) => o.valor === sp.ordem)?.valor ?? "vendidos";

  const supabase = await createClient();
  let lista, capas;
  try {
    lista = ordenarProdutos(await produtosVendidos(supabase, periodo.inicio, periodo.fimExclusivo), ordem);
    capas = await capasDeProdutos(
      supabase,
      lista.slice(0, LIMITE).map((p) => p.id).filter((id): id is string => !!id),
    );
  } catch (e) {
    return (
      <div>
        <PageHeader title="Relatórios" />
        <ErrorMessage>Não foi possível carregar os produtos: {mensagemDeErro(e)}</ErrorMessage>
      </div>
    );
  }

  const exibidos = lista.slice(0, LIMITE);
  const valorDe = (p: (typeof lista)[number]) => (ordem === "vendidos" ? p.quantidade : ordem === "lucro" ? Math.max(p.lucro, 0) : Math.max(p.margem, 0));
  const maior = Math.max(...exibidos.map(valorDe), 1);

  return (
    <div>
      <PageHeader title="Relatórios" />
      <AbasRelatorios atual="produtos" periodo={periodo} />

      <div className="mb-6">
        <SeletorPeriodo periodo={periodo} basePath="/relatorios/produtos" extra={{ ordem: ordem === "vendidos" ? undefined : ordem }} />
      </div>

      {lista.length === 0 ? (
        <EstadoVazio
          titulo="Nenhum produto vendido nesse período"
          texto="Registre vendas ou escolha outro período para ver quais produtos mais saem e mais rendem."
          acoes={
            <Link href="/vendas/novo" className={btnPrimary}>
              Nova venda
            </Link>
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          <Segmentos
            rotulo="Ordenar produtos"
            className="w-full sm:w-96"
            itens={ORDENS.map((o) => ({ href: hrefRelatorio("/relatorios/produtos", periodo, { ordem: o.valor === "vendidos" ? undefined : o.valor }), label: o.label, ativo: ordem === o.valor }))}
          />
          <Grupo
            titulo={`${lista.length} ${lista.length === 1 ? "produto vendido" : "produtos vendidos"}`}
            semPadding
            rodape={`Lucro do produto: o que ele rendeu menos o custo, já com a parte dele no desconto da venda.${lista.length > LIMITE ? ` Mostrando os ${LIMITE} primeiros.` : ""}`}
          >
            <ul className="divide-y divide-line">
              {exibidos.map((p) => (
                <LinhaBarra
                  key={p.id ?? p.nome}
                  inicio={<FotoProduto url={(p.id && capas.get(p.id)) || null} />}
                  nome={p.nome}
                  tom={ordem === "vendidos" ? "marca" : ordem === "lucro" ? "verde" : "azul"}
                  valor={ordem === "vendidos" ? `${p.quantidade} un` : ordem === "lucro" ? formatBRL(p.lucro) : formatPct(p.margem)}
                  valorTom={p.lucro < 0 ? "text-danger" : "text-ink"}
                  fracao={valorDe(p) / maior}
                  detalhe={`${p.quantidade} un · ${formatBRL(p.receita)} · lucro ${formatBRL(p.lucro)} · margem ${formatPct(p.margem)}`}
                />
              ))}
            </ul>
          </Grupo>
        </div>
      )}
    </div>
  );
}
