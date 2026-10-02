import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import type { ProdutoComEstoque } from "@/types/domain";
import { SearchInput } from "@/components/search-input";
import { Badge, EmptyState, ErrorMessage, PageHeader } from "@/components/ui";
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
    supabase.from("produto_fotos").select("produto_id, path").order("ordem").order("created_at"),
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
  const totalFotos = new Map<string, number>();
  for (const f of fotosData ?? []) {
    if (!capaPorProduto.has(f.produto_id)) capaPorProduto.set(f.produto_id, f.path);
    totalFotos.set(f.produto_id, (totalFotos.get(f.produto_id) ?? 0) + 1);
  }

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
        description="Títulos, descrições e fotos de cada produto, prontos para copiar no marketplace."
      />

      <div className="mb-4 flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <SearchInput placeholder="Buscar produto..." />
          <VistaToggle vista={vista} hrefLista={href({ vista: "lista" })} hrefGaleria={href({ vista: "galeria" })} />
        </div>
        <div className="flex gap-1 overflow-x-auto">
          {FILTROS.map((f) => (
            <Link
              key={f.valor}
              href={href({ filtro: f.valor })}
              replace
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm ${filtro === f.valor ? "bg-fill font-medium text-ink" : "text-ink-muted hover:text-ink"}`}
            >
              {f.label}
            </Link>
          ))}
        </div>
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
                <div className="relative flex aspect-square items-center justify-center bg-fill text-ink-muted">
                  {url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />
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
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {lista.map((p) => {
            const capa = capaPorProduto.get(p.id);
            const url = capa ? urlPorCaminho.get(capa) : undefined;
            const versoes = versoesPorProduto.get(p.id) ?? 0;
            const fotos = totalFotos.get(p.id) ?? 0;
            return (
              <li key={p.id} className="hairline relative flex min-w-0 items-center gap-3 rounded-2xl bg-surface p-3 hover:bg-fill/50">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-fill text-ink-muted">
                  {url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <IconBox width={22} height={22} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <Link href={`/anuncios/${p.id}`} className="block truncate font-medium text-ink after:absolute after:inset-0">
                    {p.nome}
                  </Link>
                  <p className="truncate text-xs text-ink-muted">
                    {[p.categorias?.nome, p.marca].filter(Boolean).join(" · ") || "Sem categoria"}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <Badge tone={versoes ? "positive" : "neutral"}>
                      {versoes ? `${versoes} ${versoes === 1 ? "versão" : "versões"}` : "Sem anúncio"}
                    </Badge>
                    <Badge tone={fotos ? "info" : "neutral"}>{fotos ? `${fotos} ${fotos === 1 ? "foto" : "fotos"}` : "Sem fotos"}</Badge>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
