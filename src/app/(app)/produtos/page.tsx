import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { ProdutoComEstoque } from "@/types/domain";
import { ExcluirProdutoButton } from "./excluir-produto-button";

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default async function ProdutosPage() {
  const supabase = await createClient();
  const { data: produtos, error } = await supabase
    .from("produtos_com_estoque")
    .select("*, categorias(nome)")
    .order("nome");

  if (error) {
    return <p className="text-sm text-red-400">Erro ao carregar produtos: {error.message}</p>;
  }

  const lista = (produtos ?? []) as ProdutoComEstoque[];

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Produtos</h1>
          <p className="text-sm text-neutral-400">Gerencie seu estoque de produtos</p>
        </div>
        <Link
          href="/produtos/novo"
          className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-emerald-400"
        >
          + Novo produto
        </Link>
      </div>

      {lista.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-800 p-10 text-center text-sm text-neutral-500">
          Nenhum produto cadastrado ainda.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-neutral-800">
          <table className="w-full text-sm">
            <thead className="bg-neutral-900 text-left text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-3 font-medium">Produto</th>
                <th className="px-4 py-3 font-medium">Categoria</th>
                <th className="px-4 py-3 font-medium">Custo</th>
                <th className="px-4 py-3 font-medium">Varejo / atacado</th>
                <th className="px-4 py-3 font-medium">Estoque</th>
                <th className="px-4 py-3 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {lista.map((produto) => {
                const margem =
                  produto.preco_varejo > 0
                    ? ((produto.preco_varejo - produto.custo_min) / produto.preco_varejo) * 100
                    : 0;
                return (
                  <tr key={produto.id} className="hover:bg-neutral-900/60">
                    <td className="px-4 py-3">
                      <Link href={`/produtos/${produto.id}`} className="font-medium text-white hover:underline">
                        {produto.nome}
                      </Link>
                      <p className="text-xs text-neutral-500">{margem.toFixed(1)}% de margem</p>
                    </td>
                    <td className="px-4 py-3 text-neutral-300">
                      {produto.categorias?.nome ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-red-400">{formatBRL(produto.custo_min)}</td>
                    <td className="px-4 py-3">
                      <p className="text-white">{formatBRL(produto.preco_varejo)}</p>
                      {produto.preco_atacado && (
                        <p className="text-xs text-neutral-500">
                          Atac. {formatBRL(produto.preco_atacado)}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          "rounded-full px-2 py-0.5 text-xs font-medium " +
                          (produto.estoque_total > 0
                            ? "bg-emerald-500/10 text-emerald-400"
                            : "bg-red-500/10 text-red-400")
                        }
                      >
                        {produto.estoque_total}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <ExcluirProdutoButton produtoId={produto.id} nome={produto.nome} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
