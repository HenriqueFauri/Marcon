import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { ProdutoComEstoque } from "@/types/domain";
import { formatBRL } from "@/lib/format";
import { situacaoEstoque } from "@/lib/estoque";
import { SearchInput } from "@/components/search-input";
import {
  Badge,
  EmptyState,
  ErrorMessage,
  PageHeader,
  StatCard,
  Table,
  btnPrimary,
  tbodyClass,
  tdClass,
  thClass,
  theadClass,
  Segmentos,
} from "@/components/ui";
import { IconPlus } from "@/components/icons";

export const metadata: Metadata = { title: "Produtos" };

const FILTROS = [
  { valor: "", label: "Ativos" },
  { valor: "baixo", label: "Acabando" },
  { valor: "sem", label: "Zerados" },
  { valor: "inativos", label: "Inativos" },
] as const;

export default async function ProdutosPage({ searchParams }: PageProps<"/produtos">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().toLowerCase() : "";
  const filtro = FILTROS.find((f) => f.valor === sp.filtro)?.valor ?? "";

  const supabase = await createClient();
  const { data, error } = await supabase.from("produtos_com_estoque").select("*, categorias(nome)").order("nome");

  const novo = (
    <Link href="/produtos/novo" className={btnPrimary}>
      <IconPlus width={16} height={16} /> Novo produto
    </Link>
  );

  if (error) {
    return (
      <div>
        <PageHeader title="Produtos" action={novo} />
        <ErrorMessage>Não foi possível carregar os produtos: {error.message}</ErrorMessage>
      </div>
    );
  }

  const todos = (data ?? []) as ProdutoComEstoque[];
  const ativos = todos.filter((p) => p.status !== "inativo");
  const valorEstoque = ativos.reduce(
    (s, p) => s + Number(p.valor_estoque ?? Math.max(p.estoque_total, 0) * Number(p.custo_min)),
    0,
  );
  const contagem = {
    baixo: ativos.filter((p) => situacaoEstoque(p) === "baixo").length,
    sem: ativos.filter((p) => situacaoEstoque(p) === "sem").length,
  };

  const lista = todos.filter((p) => {
    if (filtro === "inativos") {
      if (p.status !== "inativo") return false;
    } else {
      if (p.status === "inativo") return false;
      if (filtro && situacaoEstoque(p) !== filtro) return false;
    }
    if (!q) return true;
    return [p.nome, p.marca, p.sku, p.categorias?.nome].some((v) => v?.toLowerCase().includes(q));
  });

  const filtroHref = (valor: string) => {
    const qs = new URLSearchParams();
    if (valor) qs.set("filtro", valor);
    if (q) qs.set("q", q);
    const s = qs.toString();
    return s ? `/produtos?${s}` : "/produtos";
  };

  return (
    <div>
      <PageHeader title="Produtos" action={novo} />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Produtos ativos" value={ativos.length} />
        <StatCard label="Valor em estoque (custo)" value={formatBRL(valorEstoque)} />
        <StatCard
          label="Estoque baixo"
          value={contagem.baixo}
          tone={contagem.baixo ? "warning" : "neutral"}
          href={contagem.baixo ? "/produtos?filtro=baixo" : undefined}
        />
        <StatCard
          label="Sem estoque"
          value={contagem.sem}
          tone={contagem.sem ? "negative" : "neutral"}
          href={contagem.sem ? "/produtos?filtro=sem" : undefined}
        />
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput placeholder="Buscar por nome, marca, SKU..." />
        <Segmentos
          rotulo="Filtrar produtos"
          className="sm:w-[26rem]"
          itens={FILTROS.map((f) => ({ href: filtroHref(f.valor), label: f.label, ativo: filtro === f.valor }))}
        />
      </div>

      {todos.length === 0 ? (
        <EmptyState
          title="Nenhum produto cadastrado"
          description="Cadastre seus produtos com custo e preço de venda. O lucro de cada venda é calculado sozinho."
          action={novo}
        />
      ) : lista.length === 0 ? (
        <EmptyState title="Nenhum produto encontrado" description="Tente outro termo de busca ou filtro." />
      ) : (
        <>
        {/* no celular, lista do iPhone: nome, categoria, preço e estoque; a tabela fica para telas largas */}
        <ul className="hairline divide-y divide-line overflow-hidden rounded-3xl bg-surface sm:hidden">
          {lista.map((p) => {
            const situacao = situacaoEstoque(p);
            return (
              <li key={p.id}>
                <Link href={`/produtos/${p.id}`} className="flex items-center gap-3 px-4 py-3 transition active:bg-fill">
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-[17px] leading-snug text-ink">{p.nome}</span>
                    <span className="block truncate text-[13px] text-ink-muted">
                      {[p.categorias?.nome, p.marca].filter(Boolean).join(" · ") || "Sem categoria"}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-[17px] tabular-nums text-ink">{formatBRL(p.preco_varejo)}</span>
                    <span
                      className={`block text-[13px] tabular-nums ${situacao === "sem" ? "text-danger" : situacao === "baixo" ? "text-warning" : "text-ink-muted"}`}
                    >
                      {p.estoque_total} {p.unidade_medida}
                    </span>
                  </span>
                  <span aria-hidden="true" className="text-lg text-ink-faint">
                    ›
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="hidden sm:block">
        <Table compacta>
          <thead className={theadClass}>
            <tr>
              <th className={thClass}>Produto</th>
              <th className={`${thClass} hidden text-right sm:table-cell`}>Custo</th>
              <th className={`${thClass} text-right`}>Venda</th>
              <th className={`${thClass} hidden text-right sm:table-cell`}>Margem</th>
              <th className={`${thClass} text-right`}>Estoque</th>
            </tr>
          </thead>
          <tbody className={tbodyClass}>
            {lista.map((p) => {
              const preco = Number(p.preco_varejo);
              const custo = Number(p.custo_min);
              const margem = preco > 0 ? ((preco - custo) / preco) * 100 : null;
              const situacao = situacaoEstoque(p);
              return (
                <tr key={p.id} className="relative hover:bg-fill/50">
                  <td className={tdClass}>
                    <Link href={`/produtos/${p.id}`} className="font-medium text-ink after:absolute after:inset-0">
                      {p.nome}
                    </Link>
                    <p className="text-xs text-ink-muted">
                      {[p.categorias?.nome, p.marca, p.tem_variacoes ? "com variações" : null].filter(Boolean).join(" · ") ||
                        "Sem categoria"}
                    </p>
                  </td>
                  <td className={`${tdClass} hidden text-right tabular-nums text-ink-muted sm:table-cell`}>
                    {formatBRL(custo)}
                    {p.tem_variacoes && Number(p.custo_max) !== custo && (
                      <span className="block text-xs text-ink-faint">até {formatBRL(p.custo_max)}</span>
                    )}
                  </td>
                  <td className={`${tdClass} text-right tabular-nums text-ink`}>
                    {formatBRL(preco)}
                    {p.preco_atacado != null && (
                      <span className="block text-xs text-ink-muted">atac. {formatBRL(p.preco_atacado)}</span>
                    )}
                  </td>
                  <td
                    className={`${tdClass} hidden text-right tabular-nums sm:table-cell ${margem === null ? "text-ink-faint" : margem < 0 ? "text-danger" : margem < 20 ? "text-warning" : "text-positive"}`}
                  >
                    {margem === null ? "—" : `${margem.toFixed(0)}%`}
                  </td>
                  <td className={`${tdClass} text-right`}>
                    <Badge tone={situacao === "sem" ? "negative" : situacao === "baixo" ? "warning" : "positive"}>
                      {p.estoque_total} {p.unidade_medida}
                    </Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
        </div>
        </>
      )}
    </div>
  );
}
