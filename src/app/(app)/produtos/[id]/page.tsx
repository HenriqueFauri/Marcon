import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type {
  CanalVenda,
  Fornecedor,
  MovimentoEstoque,
  ProdutoAnuncio,
  ProdutoComEstoque,
  ProdutoFoto,
  ProdutoVariacao,
} from "@/types/domain";
import { formatBRL, formatData, hojeISO } from "@/lib/format";
import { situacaoEstoque } from "@/lib/estoque";
import { Badge, Card, PageHeader, StatCard, Table, btnSecondary, tbodyClass, tdClass, thClass, theadClass } from "@/components/ui";
import { IconPencil } from "@/components/icons";
import { ProdutoAcoes } from "./produto-acoes";
import { VariacoesSection } from "./variacoes-section";
import { FotosSection } from "./fotos-section";
import { lerUso } from "@/lib/uso";
import { AnunciosSection } from "./anuncios-section";
import { ExcluirProdutoButton } from "./excluir-produto-button";

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
    { data: fotosData },
    { data: fornecedoresData },
    { data: canaisData },
    { data: anunciosData },
    { data: vendidosData },
    uso,
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
    supabase.from("produto_fotos").select("*").eq("produto_id", id).order("ordem").order("created_at"),
    supabase.from("fornecedores").select("*").order("nome"),
    supabase.from("canais_venda").select("*").order("nome"),
    supabase.from("produto_anuncios").select("*").eq("produto_id", id),
    supabase.from("venda_itens").select("quantidade, preco_unitario, custo_unitario, vendas!inner(status)").eq("produto_id", id).neq("vendas.status", "cancelada"),
    lerUso(supabase),
  ]);

  if (!produto) notFound();

  const p = produto as ProdutoComEstoque;
  const historico = (movimentos ?? []) as MovimentoEstoque[];
  const variacoes = (variacoesData ?? []) as ProdutoVariacao[];
  const fotos = (fotosData ?? []) as ProdutoFoto[];
  const fornecedores = (fornecedoresData ?? []) as Fornecedor[];
  const canais = (canaisData ?? []) as CanalVenda[];
  const anuncios = (anunciosData ?? []) as ProdutoAnuncio[];
  const vendidos = (vendidosData ?? []) as { quantidade: number; preco_unitario: number; custo_unitario: number }[];

  const unidadesVendidas = vendidos.reduce((s, v) => s + v.quantidade, 0);
  const lucroVendas = vendidos.reduce((s, v) => s + v.quantidade * (Number(v.preco_unitario) - Number(v.custo_unitario)), 0);
  const margem = Number(p.preco_varejo) > 0 ? ((Number(p.preco_varejo) - Number(p.custo_min)) / Number(p.preco_varejo)) * 100 : null;
  const situacao = situacaoEstoque(p);

  const { data: assinadas } = fotos.length
    ? await supabase.storage.from("produto-fotos").createSignedUrls(fotos.map((f) => f.path), 3600)
    : { data: [] };
  const fotosComUrl = fotos.map((foto, i) => ({
    id: foto.id,
    path: foto.path,
    url: assinadas?.[i]?.signedUrl ?? null,
    variacaoId: foto.variacao_id,
  }));
  // fotos gerais do produto e, à parte, as de cada variação
  const fotosGerais = fotosComUrl.filter((f) => !f.variacaoId);
  const fotosPorVariacao: Record<string, typeof fotosComUrl> = {};
  for (const f of fotosComUrl) {
    if (f.variacaoId) (fotosPorVariacao[f.variacaoId] ??= []).push(f);
  }
  // o anúncio usa todas: as do produto primeiro, depois as das variações
  const fotosParaAnuncio = [...fotosGerais, ...fotosComUrl.filter((f) => f.variacaoId)];

  const precisaVariacao = p.tem_variacoes && variacoes.length === 0;

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
          <>
            <ProdutoAcoes
              produtoId={p.id}
              custoAtual={Number(p.custo_min)}
              variacoes={variacoes}
              fornecedores={fornecedores}
              fornecedorPadrao={p.fornecedor_id}
              hoje={hojeISO()}
              precisaVariacao={precisaVariacao}
            />
            <Link href={`/produtos/${p.id}/editar`} className={btnSecondary}>
              <IconPencil width={16} height={16} /> Editar
            </Link>
            <ExcluirProdutoButton produtoId={p.id} nome={p.nome} />
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
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
          hint={p.alerta_estoque_baixo != null ? `Alerta com ${p.alerta_estoque_baixo} ou menos` : undefined}
        />
        <StatCard label="Vendidos" value={unidadesVendidas} hint={`${formatBRL(lucroVendas)} de lucro`} />
      </div>

      <div className="flex flex-col gap-6">
        {p.tem_variacoes && (
          <Card title="Variações" description="Cada variação tem estoque, custo e preço próprios.">
            <VariacoesSection
              produtoId={p.id}
              variacoes={variacoes}
              precoPadrao={Number(p.preco_varejo)}
              fotosPorVariacao={fotosPorVariacao}
              maxFotos={uso?.limites.fotosPorItem}
            />
          </Card>
        )}

        <Card
          title="Fotos"
          description={p.tem_variacoes ? "Fotos gerais do produto. Cada variação tem as suas, na seção Variações." : undefined}
        >
          <FotosSection produtoId={p.id} fotos={fotosGerais} maxFotos={uso?.limites.fotosPorItem} />
        </Card>

        <Card
          title="Anúncios por canal"
          description="Gere uma sugestão de título e descrição por canal, ajuste e copie junto com as fotos para publicar."
        >
          <AnunciosSection
            produtoId={p.id}
            canais={canais}
            anuncios={anuncios}
            fotos={fotosParaAnuncio}
            dados={{
              nome: p.nome,
              marca: p.marca,
              descricao: p.descricao,
              categoria: p.categorias?.nome ?? null,
              precoVarejo: Number(p.preco_varejo),
              unidade: p.unidade_medida,
              variacoes,
            }}
          />
        </Card>

        <section>
          <h2 className="mb-3 text-sm font-semibold text-ink">Histórico de estoque</h2>
          {historico.length === 0 ? (
            <p className="text-sm text-ink-muted">Nenhuma entrada ou saída de estoque registrada ainda.</p>
          ) : (
            <Table>
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
                      <span className="capitalize">{m.tipo}</span>
                      {m.produto_nome !== p.nome && (
                        <span className="block text-xs text-ink-muted">{m.produto_nome.replace(`${p.nome} — `, "")}</span>
                      )}
                      {m.observacoes && <span className="block text-xs text-ink-muted">{m.observacoes}</span>}
                    </td>
                    <td className={`${tdClass} text-right tabular-nums text-ink`}>{m.quantidade}</td>
                    <td className={`${tdClass} text-right tabular-nums text-ink-2`}>{formatBRL(m.valor_unitario)}</td>
                    <td className={`${tdClass} text-right tabular-nums text-ink`}>{formatBRL(m.quantidade * Number(m.valor_unitario))}</td>
                    <td className={`${tdClass} text-ink-muted`}>{m.fornecedor_nome ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </section>
      </div>
    </div>
  );
}
