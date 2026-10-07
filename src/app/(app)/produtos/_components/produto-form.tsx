"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Fornecedor, ProdutoComEstoque } from "@/types/domain";
import type { ActionResult } from "@/lib/action";
import { formatBRL } from "@/lib/format";
import { lerNumero } from "@/lib/numero";
import { Margem } from "@/components/margem";
import { useAction } from "@/components/use-action";
import { Card, Field, btnGhost, btnPrimary, btnSecondary, inputClass } from "@/components/ui";
import { IconPlus, IconTrash } from "@/components/icons";

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

// categoria: escolhida da lista; "Nova categoria" abre um campo para digitar o nome
const NOVA_CATEGORIA = "__nova";

function CategoriaCampo({ categorias, inicial }: { categorias: string[]; inicial: string }) {
  const opcoes = inicial && !categorias.includes(inicial) ? [inicial, ...categorias] : categorias;
  const [escolha, setEscolha] = useState(inicial);
  const [nova, setNova] = useState("");
  const nome = escolha === NOVA_CATEGORIA ? nova.trim() : escolha;

  return (
    <div className="flex flex-col gap-2">
      <Field label="Categoria">
        <select value={escolha} onChange={(e) => setEscolha(e.target.value)} className={inputClass}>
          <option value="">Sem categoria</option>
          {opcoes.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
          <option value={NOVA_CATEGORIA}>+ Nova categoria...</option>
        </select>
      </Field>
      {escolha === NOVA_CATEGORIA && (
        <input
          aria-label="Nome da nova categoria"
          value={nova}
          onChange={(e) => setNova(e.target.value)}
          autoFocus
          maxLength={100}
          className={inputClass}
          placeholder="Ex: Eletrônicos"
        />
      )}
      <input type="hidden" name="categoria" value={nome} />
    </div>
  );
}

// Uma variação do cadastro, com a margem ao vivo (custo e preço em branco valem os do produto).
function LinhaVariacaoNova({
  indice,
  podeRemover,
  onRemover,
  custoPadrao,
  precoPadrao,
}: {
  indice: number;
  podeRemover: boolean;
  onRemover: () => void;
  custoPadrao: number | null;
  precoPadrao: number | null;
}) {
  const [custo, setCusto] = useState("");
  const [preco, setPreco] = useState("");
  const custoEfetivo = lerNumero(custo) ?? custoPadrao;
  const precoEfetivo = lerNumero(preco) ?? precoPadrao;

  return (
    <div className="rounded-2xl border border-line p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[13px] font-semibold text-ink-2">Variação {indice + 1}</span>
        {podeRemover && (
          <button
            type="button"
            onClick={onRemover}
            aria-label={`Remover variação ${indice + 1}`}
            className="flex h-8 w-8 items-center justify-center rounded-full text-ink-muted hover:bg-danger-tint hover:text-danger"
          >
            <IconTrash width={16} height={16} />
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Nome *" className="col-span-2 sm:col-span-4">
          <input name="var_nome" required className={inputClass} placeholder="Ex: Azul / M" />
        </Field>
        <Field label="Estoque">
          <input name="var_estoque" type="number" inputMode="numeric" min="0" step="1" defaultValue={0} className={inputClass} />
        </Field>
        <Field label="Custo (R$)">
          <input
            name="var_custo"
            inputMode="decimal"
            value={custo}
            onChange={(e) => setCusto(e.target.value)}
            className={inputClass}
            placeholder={custoPadrao !== null ? formatBRL(custoPadrao) : "Do produto"}
          />
        </Field>
        <Field label="Preço (R$)">
          <input
            name="var_preco"
            inputMode="decimal"
            value={preco}
            onChange={(e) => setPreco(e.target.value)}
            className={inputClass}
            placeholder={precoPadrao !== null ? formatBRL(precoPadrao) : "Do produto"}
          />
        </Field>
        <Field label="SKU">
          <input name="var_sku" className={inputClass} placeholder="Opcional" />
        </Field>
        <div className="col-span-2 sm:col-span-4">
          <Margem custo={custoEfetivo} preco={precoEfetivo} />
        </div>
      </div>
    </div>
  );
}

// Variações no cadastro: cada linha vira uma variação do produto (com estoque inicial).
function VariacoesNovas({ custoPadrao, precoPadrao }: { custoPadrao: number | null; precoPadrao: number | null }) {
  const [linhas, setLinhas] = useState([0]);
  const [proximo, setProximo] = useState(1);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink-muted">
        Uma linha para cada combinação (ex: &quot;Azul / M&quot;). Custo e preço em branco usam os do produto.
      </p>
      {linhas.map((id, i) => (
        <LinhaVariacaoNova
          key={id}
          indice={i}
          podeRemover={linhas.length > 1}
          onRemover={() => setLinhas((l) => l.filter((x) => x !== id))}
          custoPadrao={custoPadrao}
          precoPadrao={precoPadrao}
        />
      ))}
      <div>
        <button
          type="button"
          onClick={() => {
            setLinhas((l) => [...l, proximo]);
            setProximo((n) => n + 1);
          }}
          className={btnSecondary}
        >
          <IconPlus width={16} height={16} /> Adicionar outra variação
        </button>
      </div>
    </div>
  );
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
  const [estoqueJaPago, setEstoqueJaPago] = useState(false);
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
      // onSubmit (e não action): o React limparia os campos ao enviar, e um erro faria a pessoa digitar tudo de novo
      onSubmit={(e) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        run(() => onSave(formData), {
          onError: setErro,
          onSuccess: () => {
            setErro(null);
            router.push(produto ? `/produtos/${produto.id}` : "/produtos");
          },
        });
      }}
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
            <CategoriaCampo categorias={categorias} inicial={produto?.categorias?.nome ?? ""} />
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
              placeholder="Estado, medidas, o que acompanha. A IA usa isso no anúncio"
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
          <p className={`mt-3 text-sm ${lucroUnit >= 0 ? "text-ink-muted" : "text-danger"}`}>
            Lucro de <strong className={lucroUnit >= 0 ? "text-positive" : "text-danger"}>{formatBRL(lucroUnit)}</strong>{" "}
            por unidade
            {margem !== null && ` · margem de ${margem.toFixed(1)}%`}
            {markup !== null && ` · markup de ${markup.toFixed(0)}%`}
          </p>
        )}
      </Card>

      <Card title="Estoque">
        <div className="flex flex-col gap-4">
          {!editando && (
            <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-line bg-canvas/40 p-3 text-sm text-ink">
              <input
                type="checkbox"
                name="tem_variacoes"
                value="true"
                checked={temVariacoes}
                onChange={(e) => setTemVariacoes(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-brand"
              />
              <span>
                Este produto tem variações (tamanho, cor...)
                <span className="mt-0.5 block text-xs text-ink-muted">
                  O estoque passa a ser controlado por variação. Preencha as variações logo abaixo.
                </span>
              </span>
            </label>
          )}

          {!editando && (
            <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-line bg-canvas/40 p-3 text-sm text-ink">
              <input
                type="checkbox"
                name="estoque_ja_pago"
                value="true"
                checked={estoqueJaPago}
                onChange={(e) => setEstoqueJaPago(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-brand"
              />
              <span>
                Esse estoque já era meu
                <span className="mt-0.5 block text-xs text-ink-muted">
                  Marque se você já tinha pago por ele antes de usar o Marcon. O estoque entra, mas nada sai do caixa agora.
                </span>
              </span>
            </label>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {!editando && (
              <Field
                label="Estoque inicial"
                hint={temVariacoes ? "Controlado por variação." : estoqueJaPago ? "Não sai do caixa." : "Entra como compra no caixa."}
              >
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
            <label className="flex items-start gap-3 rounded-xl bg-fill/60 px-4 py-3">
              <input
                type="checkbox"
                name="na_vitrine"
                defaultChecked={produto?.na_vitrine ?? false}
                className="mt-0.5 h-4 w-4 accent-brand"
              />
              <span className="text-sm">
                <span className="font-medium text-ink">Mostrar na vitrine</span>
                <span className="mt-0.5 block text-xs text-ink-muted">
                  Aparece na sua loja online (menu Vitrine). Custo e quantidade em estoque nunca aparecem.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-3 rounded-xl bg-fill/60 px-4 py-3">
              <input type="checkbox" name="destaque" defaultChecked={produto?.destaque ?? false} className="mt-0.5 h-4 w-4 accent-brand" />
              <span className="text-sm">
                <span className="font-medium text-ink">Destaque na vitrine</span>
                <span className="mt-0.5 block text-xs text-ink-muted">Aparece no carrossel no topo da loja (só vale se estiver na vitrine).</span>
              </span>
            </label>
            {editando && (
              <Field label="Situação"hint="Produtos inativos não aparecem na tela de venda.">
                <select name="status" defaultValue={produto.status} className={inputClass}>
                  <option value="ativo">Ativo</option>
                  <option value="inativo">Inativo</option>
                </select>
              </Field>
            )}
          </div>
        </div>
      </Card>

      {!editando && temVariacoes && (
        <Card title="Variações" description="Cada uma tem estoque, e opcionalmente custo e preço próprios.">
          <VariacoesNovas custoPadrao={custoN} precoPadrao={precoN} />
        </Card>
      )}

      {erro && (
        <p role="alert" className="text-sm text-danger">
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
