import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type {
  Fornecedor,
  MovimentoEstoque,
  ProdutoComEstoque,
  ProdutoVariacao,
} from "@/types/domain";
import { formatBRL, formatData, hojeISO } from "@/lib/format";
import { situacaoEstoque } from "@/lib/estoque";
import { Badge, EmptyState, PageHeader, StatCard, btnSecondary, tbodyClass, tdClass, thClass, theadClass } from "@/components/ui";
import { Grupo } from "@/components/ajustes";
import { IconPencil } from "@/components/icons";
import { ProdutoAcoes } from "./produto-acoes";
import { VariacoesSection } from "./variacoes-section";
import { ExcluirProdutoButton } from "./excluir-produto-button";

const TIPO_MOVIMENTO: Record<string, string> = { compra: "Compra", ajuste: "Ajuste", devolucao: "Devolução" };

// o título da aba mostra o nome do produto
export async function generateMetadata({ params }: PageProps<"/produtos/[id]">): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("produtos").select("nome").eq("id", id).maybeSingle();
  return { title: data?.nome ?? "Produto" };
}

export default async function ProdutoDetalhePage({ params }: PageProps<"/produtos/[id]">) {
  const { id } = await params;
  const supabase = await createClient();

  const [
    { data: produto },
    { data: movimentos },
    { data: variacoesData },
    { data: fornecedoresData },
    { data: vendidosData },
  ] = await Promise.all([
    supabase.from("produtos_com_estoque").select("*, categorias(nome)").eq("id", id).maybeSingle(),
    supabase
      .from("movimentos_estoque")
      .select("*")
      .eq("produto_id", id)
      .order("data", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.from("produto_variacoes").select("*").eq("produto_id", id).order("nome_combinacao"),
    supabase.from("fornecedores").select("*").order("nome"),
    supabase.from("venda_itens").select("quantidade, preco_unitario, custo_unitario, vendas!inner(status)").eq("produto_id", id).neq("vendas.status", "cancelada"),
  ]);

  if (!produto) notFound();

  const p = produto as ProdutoComEstoque;
  const historico = (movimentos ?? []) as MovimentoEstoque[];
  const variacoes = (variacoesData ?? []) as ProdutoVariacao[];
  const fornecedores = (fornecedoresData ?? []) as Fornecedor[];
  const vendidos = (vendidosData ?? []) as { quantidade: number; preco_unitario: number; custo_unitario: number }[];

  const unidadesVendidas = vendidos.reduce((s, v) => s + v.quantidade, 0);
  const lucroVendas = vendidos.reduce((s, v) => s + v.quantidade * (Number(v.preco_unitario) - Number(v.custo_unitario)), 0);
  const margem = Number(p.preco_varejo) > 0 ? ((Number(p.preco_varejo) - Number(p.custo_min)) / Number(p.preco_varejo)) * 100 : null;
  const situacao = situacaoEstoque(p);
  const precisaVariacao = p.tem_variacoes && variacoes.length === 0;
  // nome do item no histórico: só a variação (o movimento grava "Produto — Variação")
  const nomeVariacao = (nome: string) => nome.replace(`${p.nome} — `, "").replace(/ — /g, " · ");

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        back={{ href: "/produtos", label: "Produtos" }}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {p.nome}
            {p.status === "inativo" && <Badge>Inativo</Badge>}
          </span>
        }
        description={[p.categorias?.nome ?? "Sem categoria", p.marca, p.sku ? `SKU ${p.sku}` : null].filter(Boolean).join(" · ")}
        action={
          <Link href={`/produtos/${p.id}/editar`} className={btnSecondary}>
            <IconPencil width={15} height={15} /> Editar
          </Link>
        }
      />

      <ProdutoAcoes
        produtoId={p.id}
        custoAtual={Number(p.custo_min)}
        estoqueAtual={Number(p.estoque_atual)}
        variacoes={variacoes}
        fornecedores={fornecedores}
        fornecedorPadrao={p.fornecedor_id}
        hoje={hojeISO()}
        precisaVariacao={precisaVariacao}
      />

      <div className="mb-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label={p.tem_variacoes ? "Custo (menor)" : "Custo médio"}
          value={formatBRL(p.custo_min)}
          hint={p.fornecedor_nome ? `Fornecedor: ${p.fornecedor_nome}` : undefined}
        />
        <StatCard
          label="Preço de venda"
          value={formatBRL(p.preco_varejo)}
          hint={p.preco_atacado != null ? `Atacado ${formatBRL(p.preco_atacado)}` : margem !== null ? `${margem.toFixed(1)}% de margem` : undefined}
        />
        <StatCard
          label="Em estoque"
          value={`${p.estoque_total} ${p.unidade_medida}`}
          tone={situacao === "sem" ? "negative" : situacao === "baixo" ? "warning" : "positive"}
          hint={situacao === "sem" ? "Zerado" : situacao === "baixo" ? "Acabando" : p.alerta_estoque_baixo != null ? `Alerta com ${p.alerta_estoque_baixo} ou menos` : undefined}
        />
        <StatCard label="Vendidos" value={unidadesVendidas} hint={`${formatBRL(lucroVendas)} de lucro`} />
      </div>

      <div className="flex flex-col gap-7">
        {p.tem_variacoes && (
          <VariacoesSection produtoId={p.id} variacoes={variacoes} custoPadrao={Number(p.custo)} precoPadrao={Number(p.preco_varejo)} />
        )}

        {historico.length === 0 ? (
          <section>
            <h2 className="mb-1.5 px-4 text-[13px] uppercase text-ink-muted">Histórico de estoque</h2>
            <EmptyState title="Nenhuma movimentação ainda" description="Entradas, saídas e ajustes deste produto aparecem aqui." />
          </section>
        ) : (
          <Grupo titulo="Histórico de estoque" semPadding>
            {/* celular: lista agrupada */}
            <ul className="divide-y divide-line sm:hidden">
              {historico.map((m) => {
                const variacao = m.produto_nome !== p.nome ? nomeVariacao(m.produto_nome) : null;
                return (
                  <li key={m.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[17px] text-ink">
                        {TIPO_MOVIMENTO[m.tipo] ?? m.tipo}
                        {variacao && <span className="text-ink-muted"> · {variacao}</span>}
                      </p>
                      <p className="truncate text-[13px] text-ink-muted">
                        {[formatData(m.data), m.fornecedor_nome, m.observacoes].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[17px] tabular-nums text-ink">{m.quantidade > 0 ? `+${m.quantidade}` : m.quantidade}</p>
                      <p className="text-[13px] tabular-nums text-ink-muted">{formatBRL(m.quantidade * Number(m.valor_unitario))}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
            {/* computador: tabela */}
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full text-sm">
                <thead className={theadClass}>
                  <tr>
                    <th className={thClass}>Data</th>
                    <th className={thClass}>Item</th>
                    <th className={`${thClass} text-right`}>Qtd.</th>
                    <th className={`${thClass} text-right`}>Preço unit.</th>
                    <th className={`${thClass} text-right`}>Total</th>
                    <th className={thClass}>Fornecedor</th>
                  </tr>
                </thead>
                <tbody className={tbodyClass}>
                  {historico.map((m) => (
                    <tr key={m.id}>
                      <td className={`${tdClass} whitespace-nowrap text-ink-2`}>{formatData(m.data)}</td>
                      <td className={`${tdClass} text-ink-2`}>
                        {TIPO_MOVIMENTO[m.tipo] ?? m.tipo}
                        {m.produto_nome !== p.nome && <span className="block text-xs text-ink-muted">{nomeVariacao(m.produto_nome)}</span>}
                        {m.observacoes && <span className="block text-xs text-ink-muted">{m.observacoes}</span>}
                      </td>
                      <td className={`${tdClass} text-right tabular-nums text-ink`}>{m.quantidade}</td>
                      <td className={`${tdClass} text-right tabular-nums text-ink-2`}>{formatBRL(m.valor_unitario)}</td>
                      <td className={`${tdClass} text-right tabular-nums text-ink`}>{formatBRL(m.quantidade * Number(m.valor_unitario))}</td>
                      <td className={`${tdClass} text-ink-muted`}>{m.fornecedor_nome}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Grupo>
        )}
      </div>

      {/* segunda ação do cabeçalho e a destrutiva no fim, longe dos atalhos do dia a dia */}
      <div className="mt-10 flex flex-col items-center gap-1">
        <Link href={`/produtos/novo?copiar=${p.id}`} className="rounded-full px-4 py-2 text-[15px] font-medium text-brand-text transition hover:bg-fill">
          Duplicar produto
        </Link>
        <ExcluirProdutoButton produtoId={p.id} nome={p.nome} />
      </div>
    </div>
  );
}
