import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { formatBRL, formatData } from "@/lib/format";
import { mensagemDeErro } from "@/lib/action";
import { comecarNaPrimeira, paramsDoPeriodo, resolverPeriodo } from "@/lib/periodo";
import { formatPct, margem, paginar, totaisDeVendas, vendasConcluidas } from "@/lib/relatorios";
import { PeriodoPicker } from "@/components/periodo-picker";
import { Grupo } from "@/components/ajustes";
import { EmptyState, ErrorMessage, PageHeader, Segmentos, StatCard } from "@/components/ui";
import { AbasRelatorios } from "./abas";

export const metadata: Metadata = { title: "Relatórios" };

const LIMITE_LISTA = 30;

type Ordem = "vendidos" | "lucro" | "margem";
const ORDENS: { valor: Ordem; label: string }[] = [
  { valor: "vendidos", label: "Mais vendidos" },
  { valor: "lucro", label: "Mais lucrativos" },
  { valor: "margem", label: "Maior margem" },
];

interface ItemLinha {
  produto_id: string | null;
  produto_nome: string;
  quantidade: number;
  preco_unitario: number;
  custo_unitario: number;
  venda_id: string;
  vendas: { desconto: number } | null;
}

interface Produto {
  nome: string;
  quantidade: number;
  receita: number;
  custo: number;
}

export default async function RelatoriosPage({ searchParams }: PageProps<"/relatorios">) {
  const sp = await searchParams;
  const texto = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
  let periodo = resolverPeriodo({ mes: texto(sp.mes), meses: texto(sp.meses), todo: texto(sp.todo), de: texto(sp.de), ate: texto(sp.ate) });
  const ordem: Ordem = ORDENS.find((o) => o.valor === sp.ordem)?.valor ?? "vendidos";

  const supabase = await createClient();
  if (periodo.modo === "todo") {
    const { data: primeira } = await supabase.from("vendas").select("data").order("data", { ascending: true }).limit(1);
    periodo = comecarNaPrimeira(periodo, primeira?.[0]?.data);
  }
  const { inicio, fimExclusivo } = periodo;

  let vendas, itens;
  try {
    vendas = await vendasConcluidas(supabase, inicio, fimExclusivo);
    itens = await paginar<ItemLinha>(
      (de, ate) =>
        supabase
          .from("venda_itens")
          .select("produto_id, produto_nome, quantidade, preco_unitario, custo_unitario, venda_id, vendas!inner(desconto, data, status)")
          .eq("vendas.status", "concluida")
          .gte("vendas.data", inicio)
          .lt("vendas.data", fimExclusivo)
          .order("id")
          .range(de, ate) as unknown as PromiseLike<{ data: ItemLinha[] | null; error: { message: string } | null }>,
    );
  } catch (e) {
    return (
      <div>
        <PageHeader title="Relatórios" />
        <ErrorMessage>Não foi possível carregar o relatório: {mensagemDeErro(e)}</ErrorMessage>
      </div>
    );
  }

  // o desconto da venda é repartido entre os itens na proporção do valor de cada um
  const brutoDaVenda = new Map<string, number>();
  for (const i of itens) brutoDaVenda.set(i.venda_id, (brutoDaVenda.get(i.venda_id) ?? 0) + i.quantidade * Number(i.preco_unitario));

  const produtos = new Map<string, Produto>();
  for (const i of itens) {
    const bruto = i.quantidade * Number(i.preco_unitario);
    const total = brutoDaVenda.get(i.venda_id) ?? 0;
    const desconto = total > 0 ? (Number(i.vendas?.desconto ?? 0) * bruto) / total : 0;
    const chave = i.produto_id ?? `nome:${i.produto_nome}`;
    const p = produtos.get(chave) ?? { nome: i.produto_nome, quantidade: 0, receita: 0, custo: 0 };
    p.quantidade += i.quantidade;
    p.receita += bruto - desconto;
    p.custo += i.quantidade * Number(i.custo_unitario);
    produtos.set(chave, p);
  }

  const lista = Array.from(produtos.values()).map((p) => ({ ...p, lucro: p.receita - p.custo, margem: margem(p.receita - p.custo, p.receita) }));
  lista.sort((a, b) => (ordem === "vendidos" ? b.quantidade - a.quantidade : ordem === "lucro" ? b.lucro - a.lucro : b.margem - a.margem));
  const exibidos = lista.slice(0, LIMITE_LISTA);

  const totais = totaisDeVendas(vendas);
  const porCanal = new Map<string, { vendas: number; receita: number; custo: number }>();
  for (const v of vendas) {
    const nome = v.canal?.trim() || "Sem canal";
    const c = porCanal.get(nome) ?? { vendas: 0, receita: 0, custo: 0 };
    c.vendas += 1;
    c.receita += v.valor_total;
    c.custo += v.custo_total;
    porCanal.set(nome, c);
  }
  const canais = Array.from(porCanal.entries())
    .map(([nome, c]) => ({ nome, ...c, lucro: c.receita - c.custo, margem: margem(c.receita - c.custo, c.receita) }))
    .sort((a, b) => b.lucro - a.lucro);

  const ordemHref = (o: Ordem) => {
    const qs = new URLSearchParams(paramsDoPeriodo(periodo));
    qs.set("ordem", o);
    return `/relatorios?${qs.toString()}`;
  };

  return (
    <div>
      <PageHeader title="Relatórios" />
      <AbasRelatorios atual="produtos" />

      <div className="mb-6 flex flex-col gap-3">
        <PeriodoPicker periodo={periodo} basePath="/relatorios" params={{ ordem: ordem === "vendidos" ? undefined : ordem }} />
        {periodo.modo !== "mes" && (
          <p className="text-[13px] text-ink-muted">
            {periodo.modo === "todo" ? <>Desde a primeira venda, {formatData(periodo.de)}, até hoje</> : <>De {formatData(periodo.de)} até {formatData(periodo.ate)}</>}
          </p>
        )}
      </div>

      {vendas.length === 0 ? (
        <EmptyState title="Nenhuma venda nesse período" description="Registre vendas ou escolha outro período para ver os produtos que mais saem." />
      ) : (
        <div className="flex flex-col gap-7">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Vendido" value={formatBRL(totais.receita)} hint={`${totais.vendas} ${totais.vendas === 1 ? "venda" : "vendas"}`} />
            <StatCard label="Lucro" value={formatBRL(totais.lucro)} tone={totais.lucro >= 0 ? "positive" : "negative"} />
            <StatCard label="Margem" value={formatPct(margem(totais.lucro, totais.receita))} hint="Lucro sobre o vendido" />
            <StatCard label="Produtos" value={String(lista.length)} hint="Diferentes vendidos" />
          </div>

          <section>
            <Segmentos
              rotulo="Ordenar produtos"
              className="mb-4 w-full sm:w-96"
              itens={ORDENS.map((o) => ({ href: ordemHref(o.valor), label: o.label, ativo: ordem === o.valor }))}
            />
            <Grupo
              titulo="Produtos"
              semPadding
              rodape={`Lucro do produto: o que ele rendeu menos o custo, já com a parte dele no desconto da venda.${lista.length > LIMITE_LISTA ? ` Mostrando os ${LIMITE_LISTA} primeiros.` : ""}`}
            >
              <ul className="divide-y divide-line">
                {exibidos.map((p, i) => (
                  <li key={`${p.nome}-${i}`} className="flex items-center gap-3 px-4 py-3">
                    <span className="w-5 shrink-0 text-[13px] tabular-nums text-ink-muted">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[17px] text-ink">{p.nome}</p>
                      <p className="truncate text-[13px] text-ink-muted">
                        {p.quantidade} un · {formatBRL(p.receita)} · margem {formatPct(p.margem)}
                      </p>
                    </div>
                    <p className={`shrink-0 text-[17px] font-semibold tabular-nums ${p.lucro < 0 ? "text-danger" : "text-ink"}`}>
                      {ordem === "vendidos" ? `${p.quantidade} un` : ordem === "lucro" ? formatBRL(p.lucro) : formatPct(p.margem)}
                    </p>
                  </li>
                ))}
              </ul>
            </Grupo>
          </section>

          <Grupo titulo="Por canal de venda" semPadding rodape="A margem do canal já considera os outros gastos das vendas, como motoboy e embalagem.">
            <ul className="divide-y divide-line">
              {canais.map((c) => (
                <li key={c.nome} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[17px] text-ink">{c.nome}</p>
                    <p className="truncate text-[13px] text-ink-muted">
                      {c.vendas} {c.vendas === 1 ? "venda" : "vendas"} · {formatBRL(c.receita)} · margem {formatPct(c.margem)}
                    </p>
                  </div>
                  <p className={`shrink-0 text-[17px] font-semibold tabular-nums ${c.lucro < 0 ? "text-danger" : "text-ink"}`}>{formatBRL(c.lucro)}</p>
                </li>
              ))}
            </ul>
          </Grupo>
        </div>
      )}
    </div>
  );
}
