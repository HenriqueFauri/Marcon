"use client";

import { useState } from "react";
import type { ProdutoVariacao } from "@/types/domain";
import { formatBRL } from "@/lib/format";
import { lerNumero } from "@/lib/numero";
import { useAction } from "@/components/use-action";
import { ConfirmButton } from "@/components/confirm-button";
import { Margem } from "@/components/margem";
import { Modal } from "@/components/modal";
import { Badge, Field, btnGhost, btnIcon, btnPrimary, btnSecondary, inputClass } from "@/components/ui";
import { IconPencil, IconPlus } from "@/components/icons";
import { atualizarVariacao, criarVariacao, excluirVariacao } from "../actions";

function textoValor(v: number | null) {
  return v == null ? "" : Number(v).toFixed(2).replace(".", ",");
}

// Campos de custo e preço com a margem ao vivo. Em branco vale o custo e o preço do produto.
function CustoEPreco({
  custo,
  setCusto,
  preco,
  setPreco,
  custoPadrao,
  precoPadrao,
}: {
  custo: string;
  setCusto: (v: string) => void;
  preco: string;
  setPreco: (v: string) => void;
  custoPadrao: number;
  precoPadrao: number;
}) {
  const custoEfetivo = lerNumero(custo) ?? custoPadrao;
  const precoEfetivo = lerNumero(preco) ?? precoPadrao;
  return (
    <>
      <Field label="Custo (R$)">
        <input
          name="custo"
          inputMode="decimal"
          value={custo}
          onChange={(e) => setCusto(e.target.value)}
          className={inputClass}
          placeholder={formatBRL(custoPadrao)}
        />
      </Field>
      <Field label="Preço de venda (R$)">
        <input
          name="preco_venda"
          inputMode="decimal"
          value={preco}
          onChange={(e) => setPreco(e.target.value)}
          className={inputClass}
          placeholder={formatBRL(precoPadrao)}
        />
      </Field>
      <div className="col-span-2 sm:col-span-4">
        <Margem custo={custoEfetivo} preco={precoEfetivo} />
        {(lerNumero(custo) === null || lerNumero(preco) === null) && (
          <p className="text-xs text-ink-muted">
            Em branco, vale o do produto ({formatBRL(custoPadrao)} de custo, {formatBRL(precoPadrao)} de venda).
          </p>
        )}
      </div>
    </>
  );
}

function EditarVariacao({
  variacao,
  produtoId,
  custoPadrao,
  precoPadrao,
  onFechar,
}: {
  variacao: ProdutoVariacao;
  produtoId: string;
  custoPadrao: number;
  precoPadrao: number;
  onFechar: () => void;
}) {
  const { isPending, run } = useAction();
  const [custo, setCusto] = useState(textoValor(variacao.custo));
  const [preco, setPreco] = useState(textoValor(variacao.preco_venda));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        run(() => atualizarVariacao(formData), { onSuccess: onFechar });
      }}
      className="grid grid-cols-2 gap-3 sm:grid-cols-4"
    >
      <input type="hidden" name="id" value={variacao.id} />
      <input type="hidden" name="produto_id" value={produtoId} />
      <Field label="Nome *" className="col-span-2">
        <input name="nome_combinacao" required defaultValue={variacao.nome_combinacao} className={inputClass} />
      </Field>
      <Field label="SKU" className="col-span-2">
        <input name="sku" defaultValue={variacao.sku ?? ""} className={inputClass} placeholder="Opcional" />
      </Field>
      <CustoEPreco
        custo={custo}
        setCusto={setCusto}
        preco={preco}
        setPreco={setPreco}
        custoPadrao={custoPadrao}
        precoPadrao={precoPadrao}
      />
      <p className="col-span-2 text-xs text-ink-muted sm:col-span-4">
        O estoque muda por entrada, saída e venda. O custo é recalculado a cada entrada.
      </p>
      <div className="col-span-2 flex justify-end gap-2 sm:col-span-4">
        <button type="button" onClick={onFechar} className={btnGhost}>
          Cancelar
        </button>
        <button type="submit" disabled={isPending} className={btnPrimary}>
          {isPending ? "Salvando..." : "Salvar variação"}
        </button>
      </div>
    </form>
  );
}

export function VariacoesSection({
  produtoId,
  variacoes,
  custoPadrao,
  precoPadrao,
}: {
  produtoId: string;
  variacoes: ProdutoVariacao[];
  custoPadrao: number;
  precoPadrao: number;
}) {
  const { isPending, run } = useAction();
  const [nome, setNome] = useState("");
  const [sku, setSku] = useState("");
  const [estoque, setEstoque] = useState("0");
  const [jaPago, setJaPago] = useState(false);
  const [custo, setCusto] = useState("");
  const [preco, setPreco] = useState("");
  const [editando, setEditando] = useState<ProdutoVariacao | null>(null);

  function limpar() {
    setNome("");
    setSku("");
    setEstoque("0");
    setJaPago(false);
    setCusto("");
    setPreco("");
  }

  const qtdInicial = Number(lerNumero(estoque) ?? 0);

  return (
    <div>
      {variacoes.length > 0 ? (
        <ul className="mb-5 divide-y divide-line rounded-2xl border border-line">
          {variacoes.map((v) => {
            const custoV = v.custo ?? custoPadrao;
            const precoV = v.preco_venda ?? precoPadrao;
            const margem = precoV > 0 ? ((precoV - custoV) / precoV) * 100 : null;
            return (
              <li key={v.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 text-sm">
                <div className="min-w-0 flex-1 basis-48">
                  <p className="truncate font-medium text-ink">{v.nome_combinacao}</p>
                  <p className="text-xs text-ink-muted">
                    {[v.sku && `SKU ${v.sku}`, `custo ${formatBRL(custoV)}`, `venda ${formatBRL(precoV)}`].filter(Boolean).join(" · ")}
                  </p>
                  {margem !== null && (
                    <p className={`text-xs ${precoV - custoV >= 0 ? "text-positive" : "text-danger"}`}>
                      Lucro de {formatBRL(precoV - custoV)} · margem de {margem.toFixed(1)}%
                    </p>
                  )}
                </div>
                <Badge tone={v.estoque > 0 ? "positive" : "negative"}>{v.estoque} em estoque</Badge>
                <div className="flex items-center">
                  <button
                    type="button"
                    onClick={() => setEditando(v)}
                    aria-label={`Editar variação ${v.nome_combinacao}`}
                    className={btnIcon}
                  >
                    <IconPencil width={16} height={16} />
                  </button>
                  <ConfirmButton
                    title={`Excluir a variação “${v.nome_combinacao}”?`}
                    description={v.estoque > 0 ? `Ela ainda tem ${v.estoque} unidade(s) em estoque, que deixarão de ser contadas.` : undefined}
                    ariaLabel={`Excluir variação ${v.nome_combinacao}`}
                    onConfirm={() => excluirVariacao(v.id, produtoId)}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mb-4 rounded-lg border border-warning/30 bg-warning-tint px-3 py-2 text-sm text-warning">
          Nenhuma variação ainda. Adicione a primeira abaixo (ex: &quot;Azul / M&quot;).
        </p>
      )}

      <h3 className="mb-3 text-[15px] font-semibold text-ink">Nova variação</h3>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const formData = new FormData(e.currentTarget);
          run(() => criarVariacao(formData), { onSuccess: limpar });
        }}
        className="grid grid-cols-2 gap-3 sm:grid-cols-4"
      >
        <input type="hidden" name="produto_id" value={produtoId} />
        <Field label="Nome *" className="col-span-2">
          <input
            name="nome_combinacao"
            required
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            className={inputClass}
            placeholder="Ex: Azul / M"
          />
        </Field>
        <Field label="SKU">
          <input name="sku" value={sku} onChange={(e) => setSku(e.target.value)} className={inputClass} placeholder="Opcional" />
        </Field>
        <Field label="Estoque inicial">
          <input
            name="estoque"
            type="number"
            inputMode="numeric"
            min="0"
            step="1"
            value={estoque}
            onChange={(e) => setEstoque(e.target.value)}
            className={inputClass}
          />
        </Field>
        <CustoEPreco
          custo={custo}
          setCusto={setCusto}
          preco={preco}
          setPreco={setPreco}
          custoPadrao={custoPadrao}
          precoPadrao={precoPadrao}
        />
        <div className="col-span-2 sm:col-span-4">
          <button type="submit" disabled={isPending} className={btnSecondary}>
            <IconPlus width={16} height={16} />
            {isPending ? "Salvando..." : "Adicionar variação"}
          </button>
          {qtdInicial > 0 && (
            <label className="mt-3 flex cursor-pointer items-start gap-2 text-xs text-ink-muted">
              <input
                type="checkbox"
                name="estoque_ja_pago"
                value="true"
                checked={jaPago}
                onChange={(e) => setJaPago(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-brand"
              />
              <span>
                Esse estoque já era meu, não sai do caixa.
                {!jaPago && ` Senão, entra como compra e sai do caixa (${formatBRL(qtdInicial * (lerNumero(custo) ?? custoPadrao))}).`}
              </span>
            </label>
          )}
        </div>
      </form>

      <Modal open={!!editando} onClose={() => setEditando(null)} title="Editar variação" size="lg">
        {editando && (
          <EditarVariacao
            key={editando.id}
            variacao={editando}
            produtoId={produtoId}
            custoPadrao={custoPadrao}
            precoPadrao={precoPadrao}
            onFechar={() => setEditando(null)}
          />
        )}
      </Modal>
    </div>
  );
}
