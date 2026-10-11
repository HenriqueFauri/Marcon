import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { enderecoDoApp } from "@/lib/indicacao-servidor";
import { ProdutoNaVitrine } from "./produto-na-vitrine";

export const metadata: Metadata = { title: "Vitrine | Produto" };

// Como um produto aparece na loja: se aparece, a capa, as fotos e o texto. Tudo o que é da vitrine
// fica aqui; a tela de Anúncios cuida só dos anúncios (e de enviar as fotos).
export default async function ProdutoDaVitrinePage({ params }: PageProps<"/vitrine/produtos/[id]">) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: p }, { data: variacoes }, { data: fotos }, { data: anuncios }, { data: canais }, { data: vitrine }, base] =
    await Promise.all([
      // da tabela, não da view: a view produtos_com_estoque não tem as colunas da vitrine
      supabase
        .from("produtos")
        .select("id, nome, descricao, preco_varejo, status, na_vitrine, destaque, vitrine_titulo, vitrine_descricao, vitrine_capa_id")
        .eq("id", id)
        .maybeSingle(),
      supabase.from("produto_variacoes").select("id, nome_combinacao, preco_venda").eq("produto_id", id).order("created_at"),
      supabase.from("produto_fotos").select("id, path, variacao_id, na_vitrine").eq("produto_id", id).order("ordem").order("created_at"),
      supabase.from("produto_anuncios").select("id, canal_id, titulo, descricao").eq("produto_id", id).order("created_at"),
      supabase.from("canais_venda").select("id, nome"),
      supabase.from("vitrines").select("slug, ativa").maybeSingle(),
      enderecoDoApp(),
    ]);

  if (!p) notFound();

  const { data: assinadas } = fotos?.length
    ? await supabase.storage.from("produto-fotos").createSignedUrls(fotos.map((f) => f.path), 3600)
    : { data: [] };

  const precos = (variacoes ?? []).map((v) => Number(v.preco_venda ?? p.preco_varejo));
  const menor = precos.length ? Math.min(...precos) : Number(p.preco_varejo);
  const canal = new Map((canais ?? []).map((c) => [c.id as string, c.nome as string]));
  const contagem = new Map<string, number>();

  return (
    <ProdutoNaVitrine
      produto={{
        id: p.id,
        nome: p.nome,
        descricao: p.descricao ?? "",
        preco: menor,
        precoVaria: precos.length > 1 && Math.max(...precos) !== menor,
        ativo: p.status === "ativo",
        naVitrine: p.na_vitrine,
        destaque: p.destaque,
        titulo: p.vitrine_titulo ?? "",
        descricaoDaLoja: p.vitrine_descricao ?? "",
        capaId: p.vitrine_capa_id ?? null,
      }}
      fotos={(fotos ?? []).map((f, i) => ({
        id: f.id,
        url: assinadas?.[i]?.signedUrl ?? null,
        variacaoId: f.variacao_id,
        naVitrine: f.na_vitrine !== false,
      }))}
      variacoes={(variacoes ?? []).map((v) => ({ id: v.id, nome: v.nome_combinacao }))}
      anuncios={(anuncios ?? [])
        .filter((a) => (a.titulo ?? "").trim() || (a.descricao ?? "").trim())
        .map((a) => {
          const n = (contagem.get(a.canal_id) ?? 0) + 1;
          contagem.set(a.canal_id, n);
          return {
            id: a.id,
            rotulo: `${canal.get(a.canal_id) ?? "Anúncio"} · versão ${n}`,
            titulo: a.titulo ?? "",
            descricao: a.descricao ?? "",
          };
        })}
      linkNaLoja={vitrine?.ativa ? `${base}/loja/${vitrine.slug}?p=${p.id}` : null}
    />
  );
}
