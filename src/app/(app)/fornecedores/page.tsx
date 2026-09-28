import { createClient } from "@/lib/supabase/server";
import type { Fornecedor } from "@/types/domain";
import { NovoFornecedorForm } from "./novo-fornecedor-form";
import { ExcluirFornecedorButton } from "./excluir-fornecedor-button";

export default async function FornecedoresPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("fornecedores").select("*").order("nome");

  if (error) {
    return <p className="text-sm text-red-400">Erro ao carregar fornecedores: {error.message}</p>;
  }

  const fornecedores = (data ?? []) as Fornecedor[];

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Fornecedores</h1>
          <p className="text-sm text-neutral-400">
            Cadastre fornecedores pra vincular às entradas de estoque.
          </p>
        </div>
        <NovoFornecedorForm />
      </div>

      {fornecedores.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-800 p-10 text-center text-sm text-neutral-500">
          Nenhum fornecedor cadastrado ainda.
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
              {fornecedores.map((f) => (
                <tr key={f.id} className="hover:bg-neutral-900/60">
                  <td className="px-4 py-3 font-medium text-white">{f.nome}</td>
                  <td className="px-4 py-3 text-neutral-300">{f.telefone ?? "—"}</td>
                  <td className="px-4 py-3 text-neutral-300">{f.email ?? "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <ExcluirFornecedorButton id={f.id} nome={f.nome} />
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
