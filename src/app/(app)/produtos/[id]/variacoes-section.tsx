"use client";

import { RotuloAcao } from "@/components/rotulo-acao";
import { useState } from "react";
import type { ProdutoVariacao } from "@/types/domain";
import { formatBRL } from "@/lib/format";
import { lerNumero } from "@/lib/numero";
import { useAction } from "@/components/use-action";
import { ConfirmButton } from "@/components/confirm-button";
import { Margem } from "@/components/margem";
import { Modal } from "@/components/modal";
import { Field, btnGhost, btnPrimary, btnSecondary, inputClass } from "@/components/ui";
import { Grupo, Segmentado } from "@/components/ajustes";
import { IconPlus } from "@/components/icons";
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
      <div className="col-span-2 flex flex-col-reverse gap-2 sm:col-span-4 sm:flex-row sm:items-center sm:justify-between">
        <ConfirmButton
          title={`Excluir a variação “${variacao.nome_combinacao}”?`}
          description={
            variacao.estoque > 0
              ? `Ela ainda tem ${variacao.estoque === 1 ? "1 unidade" : `${variacao.estoque} unidades`} em estoque, que deixarão de ser contadas.`
              : undefined
          }
          ariaLabel={`Excluir variação ${variacao.nome_combinacao}`}
          onConfirm={() => excluirVariacao(variacao.id, produtoId)}
          onDone={onFechar}
          className="rounded-full px-4 py-2.5 text-[15px] font-medium text-danger transition hover:bg-danger-tint"
        >
          Excluir variação
        </ConfirmButton>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <button type="button" onClick={onFechar} className={btnGhost}>
            Cancelar
          </button>
          <button type="submit" disabled={isPending} className={`${btnPrimary} w-full sm:w-auto`}>
            <RotuloAcao pendente={isPending} ocupado="Salvando...">
              Salvar variação
            </RotuloAcao>
          </button>
        </div>
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
  const [origem, setOrigem] = useState<"ja_era_meu" | "comprei">("ja_era_meu");
  const [custo, setCusto] = useState("");
  const [preco, setPreco] = useState("");
  const [editando, setEditando] = useState<ProdutoVariacao | null>(null);

  function limpar() {
    setNome("");
    setSku("");
    setEstoque("0");
    setOrigem("ja_era_meu");
    setCusto("");
    setPreco("");
  }

  const qtdInicial = Number(lerNumero(estoque) ?? 0);

  return (
    <>
      <Grupo titulo="Variações" semPadding>
        {variacoes.length > 0 ? (
          <ul className="divide-y divide-line">
            {variacoes.map((v) => {
              const custoV = v.custo ?? custoPadrao;
              const precoV = v.preco_venda ?? precoPadrao;
              const lucro = precoV - custoV;
              const margem = precoV > 0 ? (lucro / precoV) * 100 : null;
              return (
                <li key={v.id}>
                  <button
                    type="button"
                    onClick={() => setEditando(v)}
                    aria-label={`Editar variação ${v.nome_combinacao}`}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-fill/60 active:bg-fill"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[17px] text-ink">{v.nome_combinacao}</p>
                      <p className="truncate text-[13px] text-ink-muted">
                        {[
                          v.sku && `SKU ${v.sku}`,
                          `custo ${formatBRL(custoV)}`,
                          margem !== null ? `${lucro >= 0 ? "lucro" : "prejuízo"} de ${formatBRL(Math.abs(lucro))} (${margem.toFixed(0)}%)` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[17px] tabular-nums text-ink">{formatBRL(precoV)}</p>
                      <p className={`text-[13px] tabular-nums ${v.estoque > 0 ? "text-ink-muted" : "text-danger"}`}>
                        {v.estoque > 0 ? `${v.estoque} em estoque` : "Zerado"}
                      </p>
                    </div>
                    <span aria-hidden="true" className="text-lg text-ink-faint">
                      ›
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="px-4 py-3 text-[15px] text-ink-muted">Nenhuma variação ainda. Adicione a primeira abaixo (ex.: &quot;Azul / M&quot;).</p>
        )}
      </Grupo>

      <Grupo titulo="Nova variação">
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
          {/* mesma escolha do cadastro do produto: de onde veio o estoque inicial */}
          {qtdInicial > 0 && (
            <div className="col-span-2 flex flex-col gap-1.5 sm:col-span-4">
              <Segmentado
                name="estoque_origem"
                rotulo="De onde veio esse estoque"
                valor={origem}
                onMudar={setOrigem}
                opcoes={[
                  { valor: "ja_era_meu", label: "Já era meu" },
                  { valor: "comprei", label: "Comprei agora" },
                ]}
              />
              <p className="text-xs text-ink-muted">
                {origem === "comprei"
                  ? `Entra como compra e sai do caixa hoje (${formatBRL(qtdInicial * (lerNumero(custo) ?? custoPadrao))}).`
                  : "Você já tinha pago antes. O estoque entra e nada sai do caixa."}
              </p>
            </div>
          )}
          <div className="col-span-2 sm:col-span-4">
            <button type="submit" disabled={isPending} className={`${btnSecondary} w-full sm:w-auto`}>
              <IconPlus width={16} height={16} />
              <RotuloAcao pendente={isPending} ocupado="Salvando...">
                Adicionar variação
              </RotuloAcao>
            </button>
          </div>
        </form>
      </Grupo>

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
    </>
  );
}
