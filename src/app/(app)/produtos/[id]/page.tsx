import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { MovimentoEstoque, ProdutoComEstoque } from "@/types/domain";
import { EntradaEstoqueForm } from "./entrada-estoque-form";

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatData(value: string) {
  return new Date(value + "T00:00:00").toLocaleDateString("pt-BR");
}

export default async function ProdutoDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: produto }, { data: movimentos }] = await Promise.all([
    supabase.from("produtos_com_estoque").select("*, categorias(nome)").eq("id", id).single(),
    supabase
      .from("movimentos_estoque")
      .select("*")
      .eq("produto_id", id)
      .order("data", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);

  if (!produto) notFound();

  const p = produto as ProdutoComEstoque;
  const historico = (movimentos ?? []) as MovimentoEstoque[];

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-white">{p.nome}</h1>
        <p className="text-sm text-neutral-400">
          {p.categorias?.nome ?? "Sem categoria"} · SKU {p.sku ?? "—"}
        </p>
      </div>

      <div className="mb-8 grid grid-cols-4 gap-3">
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
          <p className="text-xs text-neutral-500">Custo</p>
          <p className="text-lg font-semibold text-red-400">{formatBRL(p.custo_min)}</p>
        </div>
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
          <p className="text-xs text-neutral-500">Varejo</p>
          <p className="text-lg font-semibold text-white">{formatBRL(p.preco_varejo)}</p>
        </div>
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
          <p className="text-xs text-neutral-500">Atacado</p>
          <p className="text-lg font-semibold text-white">
            {p.preco_atacado ? formatBRL(p.preco_atacado) : "—"}
          </p>
        </div>
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
          <p className="text-xs text-neutral-500">Estoque</p>
          <p className="text-lg font-semibold text-emerald-400">{p.estoque_total}</p>
        </div>
      </div>

      <div className="mb-8 rounded-xl border border-neutral-800 bg-neutral-900 p-5">
        <h2 className="mb-4 text-sm font-semibold text-white">Registrar entrada de estoque</h2>
        <EntradaEstoqueForm produtoId={p.id} custoAtual={p.custo_min} />
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-white">
          Histórico de compras e ajustes
        </h2>
        {historico.length === 0 ? (
          <p className="text-sm text-neutral-500">Nenhuma entrada de estoque registrada ainda.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-neutral-800">
            <table className="w-full text-sm">
              <thead className="bg-neutral-900 text-left text-xs uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Data</th>
                  <th className="px-4 py-2 font-medium">Tipo</th>
                  <th className="px-4 py-2 font-medium">Qtd.</th>
                  <th className="px-4 py-2 font-medium">Preço unit.</th>
                  <th className="px-4 py-2 font-medium">Total</th>
                  <th className="px-4 py-2 font-medium">Fornecedor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {historico.map((m) => (
                  <tr key={m.id}>
                    <td className="px-4 py-2 text-neutral-300">{formatData(m.data)}</td>
                    <td className="px-4 py-2 capitalize text-neutral-300">{m.tipo}</td>
                    <td className="px-4 py-2 text-white">{m.quantidade}</td>
                    <td className="px-4 py-2 text-neutral-300">{formatBRL(m.valor_unitario)}</td>
                    <td className="px-4 py-2 text-white">
                      {formatBRL(m.quantidade * m.valor_unitario)}
                    </td>
                    <td className="px-4 py-2 text-neutral-400">{m.fornecedor_nome ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
