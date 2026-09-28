import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { LancamentoCaixa, ProdutoComEstoque } from "@/types/domain";

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default async function DashboardPage() {
  const supabase = await createClient();

  const [{ data: produtosData }, { data: lancamentosData }] = await Promise.all([
    supabase.from("produtos_com_estoque").select("*"),
    supabase.from("lancamentos_caixa").select("*"),
  ]);

  const produtos = (produtosData ?? []) as ProdutoComEstoque[];
  const lancamentos = (lancamentosData ?? []) as LancamentoCaixa[];

  const valorEstoque = produtos.reduce((s, p) => s + p.estoque_total * p.custo_min, 0);
  const entradas = lancamentos.filter((l) => l.tipo === "entrada").reduce((s, l) => s + l.valor, 0);
  const saidas = lancamentos.filter((l) => l.tipo === "saida").reduce((s, l) => s + l.valor, 0);
  const saldo = entradas - saidas;
  const produtosSemEstoque = produtos.filter((p) => p.estoque_total <= 0).length;

  const cards = [
    { label: "Entradas de caixa", value: formatBRL(entradas), color: "text-emerald-400" },
    { label: "Saídas de caixa", value: formatBRL(saidas), color: "text-red-400" },
    { label: "Saldo em caixa", value: formatBRL(saldo), color: saldo >= 0 ? "text-emerald-400" : "text-red-400" },
    { label: "Valor em estoque", value: formatBRL(valorEstoque), color: "text-white" },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-white">Dashboard</h1>
        <p className="text-sm text-neutral-400">Visão geral do seu negócio</p>
      </div>

      <div className="mb-8 grid grid-cols-4 gap-3">
        {cards.map((card) => (
          <div key={card.label} className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
            <p className="text-xs text-neutral-500">{card.label}</p>
            <p className={`text-lg font-semibold ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Produtos</h2>
            <Link href="/produtos" className="text-xs text-emerald-400 hover:underline">
              Ver todos
            </Link>
          </div>
          <p className="text-sm text-neutral-400">{produtos.length} produto(s) cadastrado(s)</p>
          <p className="text-sm text-neutral-400">
            {produtosSemEstoque > 0
              ? `${produtosSemEstoque} sem estoque`
              : "Nenhum produto sem estoque"}
          </p>
        </div>

        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Fluxo de caixa</h2>
            <Link href="/fluxo-de-caixa" className="text-xs text-emerald-400 hover:underline">
              Ver tudo
            </Link>
          </div>
          <p className="text-sm text-neutral-400">{lancamentos.length} lançamento(s) no total</p>
        </div>
      </div>
    </div>
  );
}
