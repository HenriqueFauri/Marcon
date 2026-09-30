import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import type { Fornecedor } from "@/types/domain";
import { PageHeader } from "@/components/ui";
import { AvisoDeLimite, LimiteAtingido } from "@/components/limite-do-plano";
import { AVISAR_QUANDO_FALTAREM, lerUso, restante } from "@/lib/uso";
import { ProdutoForm } from "../_components/produto-form";
import { criarProduto } from "../actions";

export const metadata: Metadata = { title: "Novo produto" };

export default async function NovoProdutoPage() {
  const supabase = await createClient();
  const [{ data: fornecedores }, { data: categorias }, uso] = await Promise.all([
    supabase.from("fornecedores").select("*").order("nome"),
    supabase.from("categorias").select("nome").order("nome"),
    lerUso(supabase),
  ]);

  // plano grátis: 50 produtos. O banco barra; aqui só se explica antes de o erro aparecer
  const vagas = uso ? restante(uso.produtos, uso.limites.produtos) : null;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Novo produto" back={{ href: "/produtos", label: "Produtos" }} />
      {uso && vagas === 0 ? (
        <LimiteAtingido
          titulo="Você chegou ao limite de produtos"
          texto={`O plano grátis tem ${uso.limites.produtos} produtos e você já cadastrou ${uso.produtos}. Seus produtos continuam todos aí. Assine o plano Marcon para cadastrar sem limite.`}
        />
      ) : (
        <>
          {vagas !== null && vagas <= AVISAR_QUANDO_FALTAREM && (
            <AvisoDeLimite>
              {vagas === 1 ? "Cabe mais 1 produto no plano grátis." : `Cabem mais ${vagas} produtos no plano grátis.`}
            </AvisoDeLimite>
          )}
          <ProdutoForm
            fornecedores={(fornecedores ?? []) as Fornecedor[]}
            categorias={(categorias ?? []).map((c) => c.nome as string)}
            onSave={criarProduto}
          />
        </>
      )}
    </div>
  );
}
