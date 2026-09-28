import { createClient } from "@/lib/supabase/server";
import type { ParcelaComVenda } from "@/types/domain";
import { MarcarPagoButton } from "./marcar-pago-button";

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatData(value: string) {
  return new Date(value + "T00:00:00").toLocaleDateString("pt-BR");
}

const STATUS_LABEL: Record<string, string> = {
  pendente: "Pendente",
  pago: "Pago",
  atrasado: "Atrasado",
};

const STATUS_CLASS: Record<string, string> = {
  pendente: "bg-amber-500/10 text-amber-400",
  pago: "bg-emerald-500/10 text-emerald-400",
  atrasado: "bg-red-500/10 text-red-400",
};

export default async function ContasAReceberPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("parcelas_com_status")
    .select("*, vendas(cliente_nome)")
    .order("vencimento");

  if (error) {
    return <p className="text-sm text-red-400">Erro ao carregar contas a receber: {error.message}</p>;
  }

  const parcelas = (data ?? []) as ParcelaComVenda[];
  const pendentes = parcelas.filter((p) => p.status_efetivo !== "pago");
  const totalPendente = pendentes.reduce((s, p) => s + p.valor, 0);
  const atrasadas = parcelas.filter((p) => p.status_efetivo === "atrasado");

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-white">Contas a receber</h1>
        <p className="text-sm text-neutral-400">Parcelas de vendas a prazo e fiado.</p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
          <p className="text-xs text-neutral-500">Total pendente</p>
          <p className="text-lg font-semibold text-amber-400">{formatBRL(totalPendente)}</p>
        </div>
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
          <p className="text-xs text-neutral-500">Atrasadas</p>
          <p className="text-lg font-semibold text-red-400">{atrasadas.length}</p>
        </div>
      </div>

      {parcelas.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-800 p-10 text-center text-sm text-neutral-500">
          Nenhuma conta a receber. Registre uma venda a prazo em Vendas.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-neutral-800">
          <table className="w-full text-sm">
            <thead className="bg-neutral-900 text-left text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-3 font-medium">Vencimento</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Parcela</th>
                <th className="px-4 py-3 font-medium">Valor</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {parcelas.map((p) => (
                <tr key={p.id} className="hover:bg-neutral-900/60">
                  <td className="px-4 py-3 text-neutral-300">{formatData(p.vencimento)}</td>
                  <td className="px-4 py-3 text-white">{p.vendas?.cliente_nome ?? "—"}</td>
                  <td className="px-4 py-3 text-neutral-400">{p.numero_parcela}</td>
                  <td className="px-4 py-3 text-white">{formatBRL(p.valor)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[p.status_efetivo]}`}
                    >
                      {STATUS_LABEL[p.status_efetivo]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {p.status_efetivo !== "pago" && <MarcarPagoButton id={p.id} />}
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
