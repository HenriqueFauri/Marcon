import { createClient } from "@/lib/supabase/server";
import type { CanalVenda, Cliente, FormaPagamento, ProdutoComEstoque } from "@/types/domain";
import { VendaForm } from "./venda-form";

export default async function NovaVendaPage() {
  const supabase = await createClient();
  const [{ data: produtosData }, { data: clientesData }, { data: canaisData }, { data: formasData }] =
    await Promise.all([
      supabase.from("produtos_com_estoque").select("*").gt("estoque_total", 0).order("nome"),
      supabase.from("clientes").select("*").order("nome"),
      supabase.from("canais_venda").select("*").order("nome"),
      supabase.from("formas_pagamento").select("*").order("nome"),
    ]);

  const produtos = (produtosData ?? []) as ProdutoComEstoque[];
  const clientes = (clientesData ?? []) as Cliente[];
  const canais = (canaisData ?? []) as CanalVenda[];
  const formas = (formasData ?? []) as FormaPagamento[];

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold text-white">Nova venda</h1>

      {produtos.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-800 p-10 text-center text-sm text-neutral-500">
          Nenhum produto com estoque disponível pra vender.
        </div>
      ) : (
        <VendaForm produtos={produtos} clientes={clientes} canais={canais} formas={formas} />
      )}
    </div>
  );
}
