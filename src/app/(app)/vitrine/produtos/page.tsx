import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { enderecoDoApp } from "@/lib/indicacao-servidor";
import { Card } from "@/components/ui";
import { ProdutosDaVitrine, type ProdutoDaLista } from "../produtos-da-vitrine";

export const metadata: Metadata = { title: "Vitrine | Produtos" };

export default async function VitrineProdutosPage() {
  const supabase = await createClient();
  const [{ data: vitrine }, { data: produtosData }, { data: estoquesData }, { data: fotosData }, base] = await Promise.all([
    supabase.from("vitrines").select("slug, ativa").maybeSingle(),
    // da tabela, não da view: a view produtos_com_estoque não tem as colunas da vitrine
    supabase.from("produtos").select("id, nome, preco_varejo, na_vitrine, destaque").eq("status", "ativo").order("nome"),
    supabase.from("produtos_com_estoque").select("id, estoque_total").eq("status", "ativo"),
    supabase.from("produto_fotos").select("produto_id, path, variacao_id").order("ordem").order("created_at"),
    enderecoDoApp(),
  ]);

  // capa de cada produto: a primeira foto geral; foto de variação só se não houver nenhuma geral
  const capa = new Map<string, string>();
  const capaGeral = new Map<string, string>();
  for (const f of fotosData ?? []) {
    if (f.variacao_id === null && !capaGeral.has(f.produto_id)) capaGeral.set(f.produto_id, f.path);
    if (!capa.has(f.produto_id)) capa.set(f.produto_id, f.path);
  }
  for (const [id, path] of capaGeral) capa.set(id, path);
  const caminhos = [...new Set(capa.values())];
  const { data: assinadas } = caminhos.length
    ? await supabase.storage.from("produto-fotos").createSignedUrls(caminhos, 3600)
    : { data: [] };
  const urlPorCaminho = new Map((assinadas ?? []).map((a) => [a.path, a.signedUrl]));
  const estoque = new Map((estoquesData ?? []).map((e) => [e.id as string, Number(e.estoque_total ?? 0)]));

  const produtos: ProdutoDaLista[] = (produtosData ?? []).map((p) => {
    const caminho = capa.get(p.id);
    return {
      id: p.id,
      nome: p.nome,
      preco: Number(p.preco_varejo),
      naVitrine: p.na_vitrine,
      destaque: p.destaque,
      foto: caminho ? (urlPorCaminho.get(caminho) ?? null) : null,
      semFoto: !caminho,
      esgotado: (estoque.get(p.id) ?? 0) <= 0,
    };
  });

  return (
    <Card>
      <ProdutosDaVitrine produtos={produtos} linkDaLoja={vitrine?.ativa ? `${base}/loja/${vitrine.slug}` : null} />
    </Card>
  );
}
