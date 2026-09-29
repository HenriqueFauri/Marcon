"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Fornecedor, ProdutoComEstoque } from "@/types/domain";
import type { ActionResult } from "@/lib/action";
import { formatBRL } from "@/lib/format";
import { useAction } from "@/components/use-action";
import { Card, Field, btnGhost, btnPrimary, inputClass } from "@/components/ui";

const UNIDADES = [
  ["un", "Unidade (un)"],
  ["kg", "Quilo (kg)"],
  ["g", "Grama (g)"],
  ["l", "Litro (l)"],
  ["ml", "Mililitro (ml)"],
  ["m", "Metro (m)"],
  ["cx", "Caixa (cx)"],
  ["pct", "Pacote (pct)"],
  ["par", "Par"],
] as const;

function paraNumero(v: string) {
  const n = Number(v.replace(",", "."));
  return v.trim() && Number.isFinite(n) ? n : null;
}

function valorInicial(v: number | null | undefined) {
  return v == null ? "" : Number(v).toFixed(2);
}

export function ProdutoForm({
  fornecedores,
  categorias,
  produto,
  onSave,
}: {
  fornecedores: Fornecedor[];
  categorias: string[];
  produto?: ProdutoComEstoque;
  onSave: (formData: FormData) => Promise<ActionResult>;
}) {
  const router = useRouter();
  const editando = !!produto;
  const { isPending, run } = useAction();
  const [erro, setErro] = useState<string | null>(null);
  const [temVariacoes, setTemVariacoes] = useState(produto?.tem_variacoes ?? false);
  const [fornecedorId, setFornecedorId] = useState(produto?.fornecedor_id ?? "");
  const [custo, setCusto] = useState(valorInicial(produto?.custo));
  const [preco, setPreco] = useState(valorInicial(produto?.preco_varejo));

  const custoN = paraNumero(custo);
  const precoN = paraNumero(preco);
  const lucroUnit = custoN !== null && precoN !== null ? precoN - custoN : null;
  const margem = lucroUnit !== null && precoN ? (lucroUnit / precoN) * 100 : null;
  const markup = lucroUnit !== null && custoN ? (lucroUnit / custoN) * 100 : null;

  return (
    <form
      action={(formData) =>
        run(() => onSave(formData), {
          onError: setErro,
          onSuccess: () => {
            setErro(null);
            router.push(produto ? `/produtos/${produto.id}` : "/produtos");
          },
        })
      }
      className="flex flex-col gap-4"
    >
      <Card title="Informações">
        <div className="flex flex-col gap-4">
          <Field label="Nome do produto *">
            <input
              name="nome"
              required
              autoFocus={!editando}
              defaultValue={produto?.nome}
              className={inputClass}
              placeholder="Ex: Smartwatch Pro X"
            />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Categoria">
              <input
                name="categoria"
                list="categorias-produto"
                defaultValue={produto?.categorias?.nome ?? ""}
                className={inputClass}
                placeholder="Ex: Eletrônicos"
              />
              <datalist id="categorias-produto">
                {categorias.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>
            <Field label="Marca">
              <input name="marca" defaultValue={produto?.marca ?? ""} className={inputClass} placeholder="Opcional" />
            </Field>
            <Field label="SKU / código">
              <input name="sku" defaultValue={produto?.sku ?? ""} className={inputClass} placeholder="Opcional" />
            </Field>
          </div>

          <Field label="Descrição">
            <textarea
              name="descricao"
              rows={3}
              defaultValue={produto?.descricao ?? ""}
              className={inputClass}
              placeholder="Detalhes para catálogo, loja ou uso interno"
            />
          </Field>
        </div>
      </Card>

      <Card title="Preços">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field
            label={editando ? "Custo médio (R$)" : "Preço de custo (R$) *"}
            hint={editando ? "Atualizado automaticamente a cada entrada de estoque." : undefined}
          >
            <input
              name="custo"
              inputMode="decimal"
              required
              value={custo}
              onChange={(e) => setCusto(e.target.value)}
              className={inputClass}
              placeholder="0,00"
            />
          </Field>
          <Field label="Preço de venda (R$) *">
            <input
              name="preco_varejo"
              inputMode="decimal"
              required
              value={preco}
              onChange={(e) => setPreco(e.target.value)}
              className={inputClass}
              placeholder="0,00"
            />
          </Field>
          <Field label="Preço de atacado (R$)">
            <input
              name="preco_atacado"
              inputMode="decimal"
              defaultValue={valorInicial(produto?.preco_atacado)}
              className={inputClass}
              placeholder="Opcional"
            />
          </Field>
        </div>
        {lucroUnit !== null && (
          <p className={`mt-3 text-sm ${lucroUnit >= 0 ? "text-neutral-400" : "text-red-400"}`}>
            Lucro de <strong className={lucroUnit >= 0 ? "text-emerald-400" : "text-red-400"}>{formatBRL(lucroUnit)}</strong>{" "}
            por unidade
            {margem !== null && ` · margem de ${margem.toFixed(1)}%`}
            {markup !== null && ` · markup de ${markup.toFixed(0)}%`}
          </p>
        )}
      </Card>

      <Card title="Estoque">
        <div className="flex flex-col gap-4">
          {!editando && (
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-neutral-800 bg-neutral-950/40 p-3 text-sm text-neutral-200">
              <input
                type="checkbox"
                name="tem_variacoes"
                value="true"
                checked={temVariacoes}
                onChange={(e) => setTemVariacoes(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-emerald-500"
              />
              <span>
                Este produto tem variações (tamanho, cor...)
                <span className="mt-0.5 block text-xs text-neutral-500">
                  O estoque passa a ser controlado por variação. Depois de salvar, adicione as variações na página do produto.
                </span>
              </span>
            </label>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {!editando && (
              <Field label="Estoque inicial" hint={temVariacoes ? "Controlado por variação." : "Entra como compra no caixa."}>
                <input
                  name="estoque_inicial"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  step="1"
                  defaultValue={0}
                  disabled={temVariacoes}
                  className={inputClass}
                />
              </Field>
            )}
            <Field label="Avisar quando tiver até" hint="Deixe vazio para não avisar.">
              <input
                name="alerta_estoque_baixo"
                type="number"
                inputMode="numeric"
                min="0"
                step="1"
                defaultValue={produto?.alerta_estoque_baixo ?? ""}
                className={inputClass}
                placeholder="Ex: 3"
              />
            </Field>
            <Field label="Unidade">
              <select name="unidade_medida" defaultValue={produto?.unidade_medida ?? "un"} className={inputClass}>
                {UNIDADES.map(([valor, rotulo]) => (
                  <option key={valor} value={valor}>
                    {rotulo}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Field label="Fornecedor">
                <select
                  value={fornecedorId}
                  onChange={(e) => setFornecedorId(e.target.value)}
                  name="fornecedor_id"
                  className={inputClass}
                >
                  <option value="">Sem cadastro / digitar</option>
                  {fornecedores.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.nome}
                    </option>
                  ))}
                </select>
              </Field>
              {!fornecedorId && (
                <input
                  name="fornecedor_nome"
                  aria-label="Nome do fornecedor"
                  defaultValue={produto?.fornecedor_id ? "" : (produto?.fornecedor_nome ?? "")}
                  className={inputClass}
                  placeholder="Nome do fornecedor (opcional)"
                />
              )}
            </div>
            {editando && (
              <Field label="Situação" hint="Produtos inativos não aparecem na tela de venda.">
                <select name="status" defaultValue={produto.status} className={inputClass}>
                  <option value="ativo">Ativo</option>
                  <option value="inativo">Inativo</option>
                </select>
              </Field>
            )}
          </div>
        </div>
      </Card>

      {erro && (
        <p role="alert" className="text-sm text-red-400">
          {erro}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => router.back()} className={btnGhost}>
          Cancelar
        </button>
        <button type="submit" disabled={isPending} className={btnPrimary}>
          {isPending ? "Salvando..." : editando ? "Salvar alterações" : "Cadastrar produto"}
        </button>
      </div>
    </form>
  );
}
