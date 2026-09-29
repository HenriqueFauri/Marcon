import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import type { Fornecedor } from "@/types/domain";
import { PageHeader } from "@/components/ui";
import { ProdutoForm } from "../_components/produto-form";
import { criarProduto } from "../actions";

export const metadata: Metadata = { title: "Novo produto" };

export default async function NovoProdutoPage() {
  const supabase = await createClient();
  const [{ data: fornecedores }, { data: categorias }] = await Promise.all([
    supabase.from("fornecedores").select("*").order("nome"),
    supabase.from("categorias").select("nome").order("nome"),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Novo produto" back={{ href: "/produtos", label: "Produtos" }} />
      <ProdutoForm
        fornecedores={(fornecedores ?? []) as Fornecedor[]}
        categorias={(categorias ?? []).map((c) => c.nome as string)}
        onSave={criarProduto}
      />
    </div>
  );
}
