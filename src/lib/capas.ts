import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

// Capa de cada produto: a primeira foto geral; foto de variação só se não houver nenhuma geral.
// Uma consulta e uma chamada de assinatura para a lista toda. Devolve produto_id -> link assinado
// (produto sem foto não entra no mapa). `ids` limita a quem aparece na tela.
export async function capasDeProdutos(supabase: Supabase, ids?: Iterable<string>): Promise<Map<string, string>> {
  const quais = ids ? new Set(ids) : null;
  if (quais && quais.size === 0) return new Map();
  const { data: fotos } = await supabase
    .from("produto_fotos")
    .select("produto_id, path, variacao_id")
    .order("ordem")
    .order("created_at");

  const capa = new Map<string, string>();
  const capaGeral = new Map<string, string>();
  for (const f of fotos ?? []) {
    if (quais && !quais.has(f.produto_id)) continue;
    if (f.variacao_id === null && !capaGeral.has(f.produto_id)) capaGeral.set(f.produto_id, f.path);
    if (!capa.has(f.produto_id)) capa.set(f.produto_id, f.path);
  }
  for (const [id, path] of capaGeral) capa.set(id, path);

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
