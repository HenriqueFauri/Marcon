import { createClient } from "@/lib/supabase/server";
import type { Fornecedor } from "@/types/domain";
import { ProdutoForm } from "./produto-form";

export default async function NovoProdutoPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("fornecedores").select("*").order("nome");
  const fornecedores = (data ?? []) as Fornecedor[];

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-xl font-semibold text-white">Novo produto</h1>
      <ProdutoForm fornecedores={fornecedores} />
    </div>
  );
}
