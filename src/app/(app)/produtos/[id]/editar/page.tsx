import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Fornecedor, ProdutoComEstoque } from "@/types/domain";
import { PageHeader } from "@/components/ui";
import { ProdutoForm } from "../../_components/produto-form";
import { atualizarProduto } from "../../actions";

export const metadata: Metadata = { title: "Editar produto" };

export default async function EditarProdutoPage({ params }: PageProps<"/produtos/[id]/editar">) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: produto }, { data: vitrine }, { data: fornecedores }, { data: categorias }] = await Promise.all([
    supabase.from("produtos_com_estoque").select("*, categorias(nome)").eq("id", id).maybeSingle(),
    // a view produtos_com_estoque congelou as colunas de produtos (p.*) quando foi criada: os campos
    // da vitrine (migrations 0025 e 0026) só existem na tabela. Sem isto, salvar tirava o produto da vitrine.
    supabase.from("produtos").select("na_vitrine, destaque").eq("id", id).maybeSingle(),
    supabase.from("fornecedores").select("*").order("nome"),
    supabase.from("categorias").select("nome").order("nome"),
  ]);

  if (!produto) notFound();
  const p = { ...produto, na_vitrine: vitrine?.na_vitrine ?? false, destaque: vitrine?.destaque ?? false } as ProdutoComEstoque;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Editar produto" description={p.nome} back={{ href: `/produtos/${p.id}`, label: p.nome }} />
      <ProdutoForm
        produto={p}
        fornecedores={(fornecedores ?? []) as Fornecedor[]}
        categorias={(categorias ?? []).map((c) => c.nome as string)}
        onSave={atualizarProduto.bind(null, p.id)}
      />
    </div>
  );
}
