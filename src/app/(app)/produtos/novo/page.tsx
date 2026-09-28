import { criarProduto } from "../actions";
import { redirect } from "next/navigation";

async function action(formData: FormData) {
  "use server";
  await criarProduto(formData);
  redirect("/produtos");
}

const inputClass =
  "w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500";
const labelClass = "mb-1 block text-sm text-neutral-300";

export default function NovoProdutoPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-xl font-semibold text-white">Novo produto</h1>

      <form action={action} className="flex flex-col gap-5">
        <div>
          <label className={labelClass}>Nome do produto *</label>
          <input name="nome" required className={inputClass} placeholder="Ex: Smartwatch Pro X" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Categoria</label>
            <input name="categoria" className={inputClass} placeholder="Ex: Eletrônicos" />
          </div>
          <div>
            <label className={labelClass}>Marca</label>
            <input name="marca" className={inputClass} placeholder="Opcional" />
          </div>
        </div>

        <div>
          <label className={labelClass}>Descrição</label>
          <textarea
            name="descricao"
            rows={3}
            className={inputClass}
            placeholder="Detalhes para catálogo, loja ou uso interno"
          />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className={labelClass}>Preço de custo (R$) *</label>
            <input
              name="custo"
              type="number"
              step="0.01"
              min="0"
              required
              className={inputClass}
              placeholder="0.00"
            />
          </div>
          <div>
            <label className={labelClass}>Preço varejo (R$) *</label>
            <input
              name="preco_varejo"
              type="number"
              step="0.01"
              min="0"
              required
              className={inputClass}
              placeholder="0.00"
            />
          </div>
          <div>
            <label className={labelClass}>Preço atacado (R$)</label>
            <input
              name="preco_atacado"
              type="number"
              step="0.01"
              min="0"
              className={inputClass}
              placeholder="Opcional"
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className={labelClass}>Estoque inicial</label>
            <input
              name="estoque_inicial"
              type="number"
              min="0"
              defaultValue={0}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Unidade</label>
            <select name="unidade_medida" defaultValue="un" className={inputClass}>
              <option value="un">Unidade (un)</option>
              <option value="kg">Quilo (kg)</option>
              <option value="cx">Caixa (cx)</option>
              <option value="par">Par</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Fornecedor</label>
            <input name="fornecedor_nome" className={inputClass} placeholder="Opcional" />
          </div>
        </div>

        <p className="text-xs text-neutral-500">
          O estoque inicial já entra como uma compra no histórico e gera a saída de caixa
          correspondente — nada fica de fora do fluxo de caixa.
        </p>

        <div className="flex justify-end gap-2 border-t border-neutral-800 pt-4">
          <button
            type="submit"
            className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-emerald-400"
          >
            Cadastrar produto
          </button>
        </div>
      </form>
    </div>
  );
}
