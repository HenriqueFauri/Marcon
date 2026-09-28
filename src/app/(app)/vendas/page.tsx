import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Venda } from "@/types/domain";

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatData(value: string) {
  return new Date(value + "T00:00:00").toLocaleDateString("pt-BR");
}

export default async function VendasPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vendas")
    .select("*")
    .order("data", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    return <p className="text-sm text-red-400">Erro ao carregar vendas: {error.message}</p>;
  }

  const vendas = (data ?? []) as Venda[];
  const totalVendido = vendas.reduce((s, v) => s + v.valor_total, 0);
  const lucroTotal = vendas.reduce((s, v) => s + (v.valor_total - v.custo_total), 0);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Vendas</h1>
          <p className="text-sm text-neutral-400">Registre e acompanhe suas vendas.</p>
        </div>
        <Link
          href="/vendas/novo"
          className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-emerald-400"
        >
          + Nova venda
        </Link>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
          <p className="text-xs text-neutral-500">Total vendido</p>
          <p className="text-lg font-semibold text-white">{formatBRL(totalVendido)}</p>
        </div>
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
          <p className="text-xs text-neutral-500">Lucro das vendas</p>
          <p className="text-lg font-semibold text-emerald-400">{formatBRL(lucroTotal)}</p>
        </div>
      </div>

      {vendas.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-800 p-10 text-center text-sm text-neutral-500">
          Nenhuma venda registrada ainda.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-neutral-800">
          <table className="w-full text-sm">
            <thead className="bg-neutral-900 text-left text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-3 font-medium">Data</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Pagamento</th>
                <th className="px-4 py-3 font-medium">Total</th>
                <th className="px-4 py-3 font-medium">Lucro</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {vendas.map((v) => (
                <tr key={v.id} className="hover:bg-neutral-900/60">
                  <td className="px-4 py-3 text-neutral-300">{formatData(v.data)}</td>
                  <td className="px-4 py-3 text-white">{v.cliente_nome ?? "—"}</td>
                  <td className="px-4 py-3 text-neutral-400">
                    {v.tipo_pagamento === "a_prazo" ? "Parcelado" : "À vista"}
                    {v.forma_pagamento ? ` · ${v.forma_pagamento}` : ""}
                  </td>
                  <td className="px-4 py-3 text-white">{formatBRL(v.valor_total)}</td>
                  <td className="px-4 py-3 text-emerald-400">
                    {formatBRL(v.valor_total - v.custo_total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
