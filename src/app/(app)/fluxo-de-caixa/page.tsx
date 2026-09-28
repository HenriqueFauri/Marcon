import { createClient } from "@/lib/supabase/server";
import type { LancamentoCaixa } from "@/types/domain";
import { NovoLancamentoForm } from "./novo-lancamento-form";
import { ExcluirLancamentoButton } from "./excluir-lancamento-button";

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatData(value: string) {
  return new Date(value + "T00:00:00").toLocaleDateString("pt-BR");
}

export default async function FluxoDeCaixaPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lancamentos_caixa")
    .select("*")
    .order("data", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    return <p className="text-sm text-red-400">Erro ao carregar fluxo de caixa: {error.message}</p>;
  }

  const lancamentos = (data ?? []) as LancamentoCaixa[];
  const entradas = lancamentos.filter((l) => l.tipo === "entrada").reduce((s, l) => s + l.valor, 0);
  const saidas = lancamentos.filter((l) => l.tipo === "saida").reduce((s, l) => s + l.valor, 0);
  const saldo = entradas - saidas;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Fluxo de caixa</h1>
          <p className="text-sm text-neutral-400">
            Tudo interligado: estoque, gastos e ajustes manuais.
          </p>
        </div>
        <NovoLancamentoForm />
      </div>

      <div className="mb-6 grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
          <p className="text-xs text-neutral-500">Entradas</p>
          <p className="text-lg font-semibold text-emerald-400">{formatBRL(entradas)}</p>
        </div>
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
          <p className="text-xs text-neutral-500">Saídas</p>
          <p className="text-lg font-semibold text-red-400">{formatBRL(saidas)}</p>
        </div>
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
          <p className="text-xs text-neutral-500">Saldo</p>
          <p className={"text-lg font-semibold " + (saldo >= 0 ? "text-emerald-400" : "text-red-400")}>
            {formatBRL(saldo)}
          </p>
        </div>
      </div>

      {lancamentos.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-800 p-10 text-center text-sm text-neutral-500">
          Nenhum lançamento ainda.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-neutral-800">
          <table className="w-full text-sm">
            <thead className="bg-neutral-900 text-left text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-3 font-medium">Data</th>
                <th className="px-4 py-3 font-medium">Descrição</th>
                <th className="px-4 py-3 font-medium">Categoria</th>
                <th className="px-4 py-3 font-medium">Valor</th>
                <th className="px-4 py-3 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {lancamentos.map((l) => (
                <tr key={l.id} className="hover:bg-neutral-900/60">
                  <td className="px-4 py-3 text-neutral-300">{formatData(l.data)}</td>
                  <td className="px-4 py-3 text-white">{l.descricao}</td>
                  <td className="px-4 py-3 text-neutral-400">{l.categoria}</td>
                  <td
                    className={
                      "px-4 py-3 font-medium " +
                      (l.tipo === "entrada" ? "text-emerald-400" : "text-red-400")
                    }
                  >
                    {l.tipo === "entrada" ? "+ " : "- "}
                    {formatBRL(l.valor)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <ExcluirLancamentoButton id={l.id} />
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
