import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import type { ProdutoComEstoque } from "@/types/domain";
import { SearchInput } from "@/components/search-input";
import { Badge, EmptyState, ErrorMessage, PageHeader, Segmentos } from "@/components/ui";
import { IconBox } from "@/components/icons";
import { VistaToggle, type Vista } from "./vista-toggle";

export const metadata: Metadata = { title: "Anúncios" };

const FILTROS = [
  { valor: "", label: "Todos" },
  { valor: "sem", label: "Sem anúncio" },
  { valor: "com", label: "Com anúncio" },
] as const;

export default async function AnunciosPage({ searchParams }: PageProps<"/anuncios">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().toLowerCase() : "";
  const filtro = FILTROS.find((f) => f.valor === sp.filtro)?.valor ?? "";
  // a vista vem da URL; sem ela, vale a última escolha (cookie) e, na primeira vez, a lista
  const lembrada = (await cookies()).get("marcon-vista-anuncios")?.value;
  const vistaParam = typeof sp.vista === "string" ? sp.vista : lembrada;
  const vista: Vista = vistaParam === "galeria" ? "galeria" : "lista";

  const supabase = await createClient();
  const [{ data, error }, { data: anunciosData }, { data: fotosData }] = await Promise.all([
    supabase.from("produtos_com_estoque").select("*, categorias(nome)").neq("status", "inativo").order("nome"),
    supabase.from("produto_anuncios").select("produto_id, titulo, descricao"),
    supabase.from("produto_fotos").select("produto_id, path, variacao_id").order("ordem").order("created_at"),
  ]);

  if (error) {
    return (
      <div>
        <PageHeader title="Anúncios" />
        <ErrorMessage>Não foi possível carregar os produtos: {error.message}</ErrorMessage>
      </div>
    );
  }

  const produtos = (data ?? []) as ProdutoComEstoque[];
  const versoesPorProduto = new Map<string, number>();
  for (const a of anunciosData ?? []) {
    if (!a.titulo && !a.descricao) continue;
    versoesPorProduto.set(a.produto_id, (versoesPorProduto.get(a.produto_id) ?? 0) + 1);
  }
  const capaPorProduto = new Map<string, string>();
  const capaGeral = new Map<string, string>();
  const totalFotos = new Map<string, number>();
  for (const f of fotosData ?? []) {
    // a capa é a primeira foto geral; foto de variação só entra se o produto não tiver nenhuma geral
    if (f.variacao_id === null && !capaGeral.has(f.produto_id)) capaGeral.set(f.produto_id, f.path);
    if (!capaPorProduto.has(f.produto_id)) capaPorProduto.set(f.produto_id, f.path);
    totalFotos.set(f.produto_id, (totalFotos.get(f.produto_id) ?? 0) + 1);
  }
  for (const [produtoId, path] of capaGeral) capaPorProduto.set(produtoId, path);

  const lista = produtos.filter((p) => {
    const tem = (versoesPorProduto.get(p.id) ?? 0) > 0;
    if (filtro === "sem" && tem) return false;
    if (filtro === "com" && !tem) return false;
    if (!q) return true;
    return [p.nome, p.marca, p.sku, p.categorias?.nome].some((v) => v?.toLowerCase().includes(q));
  });

  // só assina as capas que vão aparecer
  const caminhos = lista.map((p) => capaPorProduto.get(p.id)).filter((c): c is string => !!c);
  const { data: assinadas } = caminhos.length
    ? await supabase.storage.from("produto-fotos").createSignedUrls(caminhos, 3600)
    : { data: [] };
  const urlPorCaminho = new Map((assinadas ?? []).map((a) => [a.path, a.signedUrl]));

  const href = (opcoes: { filtro?: string; vista?: Vista }) => {
    const qs = new URLSearchParams();
    const f = opcoes.filtro ?? filtro;
    if (f) qs.set("filtro", f);
    if (q) qs.set("q", q);
    qs.set("vista", opcoes.vista ?? vista);
    return `/anuncios?${qs.toString()}`;
  };

  return (
    <div>
      <PageHeader
        title="Anúncios"
      />

      <div className="mb-4 flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <SearchInput placeholder="Buscar produto..." />
          <VistaToggle vista={vista} hrefLista={href({ vista: "lista" })} hrefGaleria={href({ vista: "galeria" })} />
        </div>
        <Segmentos
          rotulo="Filtrar anúncios"
          className="sm:w-96"
          itens={FILTROS.map((f) => ({ href: href({ filtro: f.valor }), label: f.label, ativo: filtro === f.valor }))}
        />
      </div>

      {produtos.length === 0 ? (
        <EmptyState
          title="Nenhum produto cadastrado"
          description="Cadastre um produto para montar os anúncios dele."
        />
      ) : lista.length === 0 ? (
        <EmptyState title="Nenhum produto encontrado" description="Tente outro termo de busca ou filtro." />
      ) : vista === "galeria" ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {lista.map((p) => {
            const capa = capaPorProduto.get(p.id);
            const url = capa ? urlPorCaminho.get(capa) : undefined;
            const versoes = versoesPorProduto.get(p.id) ?? 0;
            const fotos = totalFotos.get(p.id) ?? 0;
            return (
              <li key={p.id} className="hairline relative flex min-w-0 flex-col overflow-hidden rounded-2xl bg-surface hover:bg-fill/50">
                {/* overflow-hidden e a foto absoluta: sem isso uma foto alta estica o quadrado e os cards ficam de tamanhos diferentes */}
                <div className="relative flex aspect-square items-center justify-center overflow-hidden bg-fill text-ink-muted">
                  {url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={url} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
                  ) : (
                    <IconBox width={32} height={32} />
                  )}
                  <div className="absolute left-2 top-2 flex flex-wrap gap-1">
                    {versoes > 0 && <Badge tone="positive">{versoes === 1 ? "1 versão" : `${versoes} versões`}</Badge>}
                  </div>
                  {fotos > 1 && (
                    <span className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white">
                      {fotos} fotos
                    </span>
                  )}
                </div>
                <div className="min-w-0 p-2.5">
                  <Link href={`/anuncios/${p.id}`} className="block truncate text-sm font-medium text-ink after:absolute after:inset-0">
                    {p.nome}
                  </Link>
                  <p className="truncate text-xs text-ink-muted">
                    {[p.categorias?.nome, p.marca].filter(Boolean).join(" · ") || "Sem categoria"}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <ul className="hairline divide-y divide-line overflow-hidden rounded-3xl bg-surface sm:grid sm:grid-cols-2 sm:gap-3 sm:divide-y-0 sm:overflow-visible sm:rounded-none sm:bg-transparent sm:shadow-none xl:grid-cols-3">
          {lista.map((p) => {
            const capa = capaPorProduto.get(p.id);
            const url = capa ? urlPorCaminho.get(capa) : undefined;
            const versoes = versoesPorProduto.get(p.id) ?? 0;
            const fotos = totalFotos.get(p.id) ?? 0;
            return (
              <li key={p.id} className="relative flex min-w-0 items-center gap-3 px-4 py-3 active:bg-fill sm:hairline sm:rounded-2xl sm:bg-surface sm:p-3 sm:hover:bg-fill/50">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-fill text-ink-faint sm:h-16 sm:w-16">
                  {url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <IconBox width={22} height={22} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <Link href={`/anuncios/${p.id}`} className="line-clamp-2 text-[17px] leading-snug text-ink after:absolute after:inset-0 sm:text-[15px] sm:font-medium">
                    {p.nome}
                  </Link>
                  <p className="mt-0.5 truncate text-[13px] text-ink-muted">
                    <span className={versoes ? "text-positive" : ""}>
                      {versoes ? `${versoes} ${versoes === 1 ? "versão" : "versões"}` : "Sem anúncio"}
                    </span>
                    {" · "}
                    {fotos ? `${fotos} ${fotos === 1 ? "foto" : "fotos"}` : "sem fotos"}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
