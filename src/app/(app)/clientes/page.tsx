import { createClient } from "@/lib/supabase/server";
import type { Cliente } from "@/types/domain";
import { NovoClienteForm } from "./novo-cliente-form";
import { ExcluirClienteButton } from "./excluir-cliente-button";

export default async function ClientesPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("clientes").select("*").order("nome");

  if (error) {
    return <p className="text-sm text-red-400">Erro ao carregar clientes: {error.message}</p>;
  }

  const clientes = (data ?? []) as Cliente[];

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Clientes</h1>
          <p className="text-sm text-neutral-400">
            Cadastre clientes pra vincular às vendas e controlar o fiado/parcelado.
          </p>
        </div>
        <NovoClienteForm />
      </div>

      {clientes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-800 p-10 text-center text-sm text-neutral-500">
          Nenhum cliente cadastrado ainda.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-neutral-800">
          <table className="w-full text-sm">
            <thead className="bg-neutral-900 text-left text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-3 font-medium">Nome</th>
                <th className="px-4 py-3 font-medium">Telefone</th>
                <th className="px-4 py-3 font-medium">E-mail</th>
                <th className="px-4 py-3 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {clientes.map((c) => (
                <tr key={c.id} className="hover:bg-neutral-900/60">
                  <td className="px-4 py-3 font-medium text-white">{c.nome}</td>
                  <td className="px-4 py-3 text-neutral-300">{c.telefone ?? "—"}</td>
                  <td className="px-4 py-3 text-neutral-300">{c.email ?? "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <ExcluirClienteButton id={c.id} nome={c.nome} />
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
