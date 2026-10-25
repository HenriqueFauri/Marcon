import type { createClient } from "@/lib/supabase/server";
import { lerTudo } from "@/lib/ler-tudo";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export interface CapaProduto {
  path: string;
  totalFotos: number;
}

// Caminho da capa de cada produto (a primeira foto geral; foto de variação só se não houver nenhuma
// geral) e quantas fotos ele tem. Vem da view produto_capas (0064), uma linha por produto, página a
// página. Sem a migration, cai na leitura de todas as fotos, também em páginas, com a mesma regra.
export async function lerCapas(supabase: Supabase): Promise<Map<string, CapaProduto>> {
  const capas = new Map<string, CapaProduto>();
  try {
    const linhas = await lerTudo<{ produto_id: string; path: string; total_fotos: number }>((de, ate) =>
      supabase.from("produto_capas").select("produto_id, path, total_fotos").order("produto_id").range(de, ate),
    );
    for (const l of linhas) capas.set(l.produto_id, { path: l.path, totalFotos: Number(l.total_fotos) });
    return capas;
  } catch {
    // view ainda não criada neste banco: segue para a leitura completa
  }

  const fotos = await lerTudo<{ produto_id: string; path: string; variacao_id: string | null }>((de, ate) =>
    supabase
      .from("produto_fotos")
      .select("produto_id, path, variacao_id")
      .order("ordem")
      .order("created_at")
      .order("id")
      .range(de, ate),
  ).catch(() => []);
  const geral = new Set<string>();
  for (const f of fotos) {
    const atual = capas.get(f.produto_id);
    if (!atual) {
      capas.set(f.produto_id, { path: f.path, totalFotos: 1 });
      if (f.variacao_id === null) geral.add(f.produto_id);
      continue;
    }
    atual.totalFotos++;
    if (f.variacao_id === null && !geral.has(f.produto_id)) {
      atual.path = f.path;
      geral.add(f.produto_id);
    }
  }
  return capas;
}

// Capa de cada produto já com o link assinado. Uma leitura e uma chamada de assinatura para a lista
// toda. Devolve produto_id -> link (produto sem foto não entra no mapa). `ids` limita a quem aparece na tela.
export async function capasDeProdutos(supabase: Supabase, ids?: Iterable<string>): Promise<Map<string, string>> {
  const quais = ids ? new Set(ids) : null;
  if (quais && quais.size === 0) return new Map();

  const capa = new Map<string, string>();
  for (const [id, c] of await lerCapas(supabase)) {
    if (!quais || quais.has(id)) capa.set(id, c.path);
  }

  const caminhos = [...new Set(capa.values())];
  if (caminhos.length === 0) return new Map();
  const { data: assinadas } = await supabase.storage.from("produto-fotos").createSignedUrls(caminhos, 3600);
  const urlPorCaminho = new Map((assinadas ?? []).map((a) => [a.path, a.signedUrl]));

  const capas = new Map<string, string>();
  for (const [id, caminho] of capa) {
    const url = urlPorCaminho.get(caminho);
    if (url) capas.set(id, url);
  }
  return capas;
}
