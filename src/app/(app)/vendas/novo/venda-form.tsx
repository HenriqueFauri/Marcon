"use client";

import { useMemo, useState, useTransition } from "react";
import type { CanalVenda, Cliente, FormaPagamento, ProdutoComEstoque } from "@/types/domain";
import { registrarVenda } from "../actions";

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

interface ItemCarrinho {
  produto_id: string;
  nome: string;
  quantidade: number;
  preco_unitario: number;
}

export function VendaForm({
  produtos,
  clientes,
  canais,
  formas,
}: {
  produtos: ProdutoComEstoque[];
  clientes: Cliente[];
  canais: CanalVenda[];
  formas: FormaPagamento[];
}) {
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([]);
  const [produtoSelecionado, setProdutoSelecionado] = useState(produtos[0]?.id ?? "");
  const [quantidade, setQuantidade] = useState(1);
  const [clienteId, setClienteId] = useState("");
  const [clienteNomeManual, setClienteNomeManual] = useState("");
  const [canalId, setCanalId] = useState("");
  const [canalManual, setCanalManual] = useState("");
  const [formaPagamentoId, setFormaPagamentoId] = useState("");
  const [formaPagamentoManual, setFormaPagamentoManual] = useState("");
  const [desconto, setDesconto] = useState(0);
  const [tipoPagamento, setTipoPagamento] = useState<"a_vista" | "a_prazo">("a_vista");
  const [numeroParcelas, setNumeroParcelas] = useState(2);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const produtoAtual = produtos.find((p) => p.id === produtoSelecionado);
  const total = carrinho.reduce((s, i) => s + i.quantidade * i.preco_unitario, 0) - desconto;
  const valorParcela = tipoPagamento === "a_prazo" && numeroParcelas > 0 ? total / numeroParcelas : 0;

  function adicionarItem() {
    if (!produtoAtual) return;
    if (quantidade < 1) return;
    setCarrinho((prev) => {
      const existente = prev.find((i) => i.produto_id === produtoAtual.id);
      if (existente) {
        return prev.map((i) =>
          i.produto_id === produtoAtual.id ? { ...i, quantidade: i.quantidade + quantidade } : i,
        );
      }
      return [
        ...prev,
        {
          produto_id: produtoAtual.id,
          nome: produtoAtual.nome,
          quantidade,
          preco_unitario: produtoAtual.preco_varejo,
        },
      ];
    });
    setQuantidade(1);
  }

  function removerItem(produtoId: string) {
    setCarrinho((prev) => prev.filter((i) => i.produto_id !== produtoId));
  }

  const itensJson = useMemo(
    () =>
      JSON.stringify(
        carrinho.map((i) => ({
          produto_id: i.produto_id,
          quantidade: i.quantidade,
          preco_unitario: i.preco_unitario,
        })),
      ),
    [carrinho],
  );

  return (
    <form
      action={(formData) =>
        startTransition(async () => {
          setError(null);
          try {
            await registrarVenda(formData);
          } catch (e) {
            setError(e instanceof Error ? e.message : "erro ao registrar venda");
          }
        })
      }
      className="grid grid-cols-1 gap-6 lg:grid-cols-3"
    >
      <input type="hidden" name="itens" value={itensJson} />

      <div className="flex flex-col gap-4 lg:col-span-2">
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
          <h2 className="mb-3 text-sm font-semibold text-white">Produtos</h2>
          <div className="flex flex-wrap gap-2">
            <select
              value={produtoSelecionado}
              onChange={(e) => setProdutoSelecionado(e.target.value)}
              className="min-w-0 flex-1 basis-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500 sm:basis-auto"
            >
              {produtos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome} — {formatBRL(p.preco_varejo)} ({p.estoque_total} em estoque)
                </option>
              ))}
            </select>
            <input
              type="number"
              min={1}
              value={quantidade}
              onChange={(e) => setQuantidade(Number(e.target.value))}
              className="w-20 shrink-0 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
            />
            <button
              type="button"
              onClick={adicionarItem}
              className="shrink-0 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-emerald-400"
            >
              Adicionar
            </button>
          </div>

          {carrinho.length > 0 && (
            <div className="mt-4 divide-y divide-neutral-800 border-t border-neutral-800">
              {carrinho.map((item) => (
                <div key={item.produto_id} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-white">
                    {item.quantidade}x {item.nome}
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="text-neutral-300">
                      {formatBRL(item.quantidade * item.preco_unitario)}
                    </span>
                    <button
                      type="button"
                      onClick={() => removerItem(item.produto_id)}
                      className="text-xs text-neutral-500 hover:text-red-400"
                    >
                      Remover
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
          <h2 className="mb-3 text-sm font-semibold text-white">Cliente</h2>
          <select
            value={clienteId}
            onChange={(e) => setClienteId(e.target.value)}
            name="cliente_id"
            className="mb-2 w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
          >
            <option value="">Sem cliente cadastrado / venda avulsa</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
          {!clienteId && (
            <input
              name="cliente_nome_manual"
              value={clienteNomeManual}
              onChange={(e) => setClienteNomeManual(e.target.value)}
              placeholder="Ou só digite o nome (sem cadastrar)"
              className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
            />
          )}
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
          <h2 className="mb-3 text-sm font-semibold text-white">Pagamento</h2>

          <div className="mb-3 flex gap-2">
            <label className="flex-1 cursor-pointer rounded-lg border border-neutral-700 p-2 text-center text-sm has-[:checked]:border-emerald-500 has-[:checked]:text-emerald-400">
              <input
                type="radio"
                name="tipo_pagamento"
                value="a_vista"
                checked={tipoPagamento === "a_vista"}
                onChange={() => setTipoPagamento("a_vista")}
                className="sr-only"
              />
              À vista
            </label>
            <label className="flex-1 cursor-pointer rounded-lg border border-neutral-700 p-2 text-center text-sm has-[:checked]:border-emerald-500 has-[:checked]:text-emerald-400">
              <input
                type="radio"
                name="tipo_pagamento"
                value="a_prazo"
                checked={tipoPagamento === "a_prazo"}
                onChange={() => setTipoPagamento("a_prazo")}
                className="sr-only"
              />
              Parcelado / fiado
            </label>
          </div>

          {tipoPagamento === "a_prazo" && (
            <div className="mb-3 grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs text-neutral-400">Nº de parcelas</label>
                <input
                  type="number"
                  name="numero_parcelas"
                  min={1}
                  value={numeroParcelas}
                  onChange={(e) => setNumeroParcelas(Number(e.target.value))}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-neutral-400">1º vencimento</label>
                <input
                  type="date"
                  name="primeiro_vencimento"
                  defaultValue={new Date().toISOString().slice(0, 10)}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          )}

          <div className="mb-3">
            <label className="mb-1 block text-xs text-neutral-400">Forma de pagamento</label>
            <select
              value={formaPagamentoId}
              onChange={(e) => setFormaPagamentoId(e.target.value)}
              name="forma_pagamento_id"
              className="mb-1 w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
            >
              <option value="">Sem cadastro / digitar</option>
              {formas.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
            </select>
            {!formaPagamentoId && (
              <input
                name="forma_pagamento_manual"
                value={formaPagamentoManual}
                onChange={(e) => setFormaPagamentoManual(e.target.value)}
                placeholder="PIX, dinheiro..."
                className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
              />
            )}
          </div>

          <div className="mb-3">
            <label className="mb-1 block text-xs text-neutral-400">Canal</label>
            <select
              value={canalId}
              onChange={(e) => setCanalId(e.target.value)}
              name="canal_id"
              className="mb-1 w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
            >
              <option value="">Sem cadastro / digitar</option>
              {canais.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
            {!canalId && (
              <input
                name="canal_manual"
                value={canalManual}
                onChange={(e) => setCanalManual(e.target.value)}
                placeholder="Instagram, WhatsApp..."
                className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
              />
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs text-neutral-400">Desconto (R$)</label>
            <input
              type="number"
              name="desconto"
              min={0}
              step="0.01"
              value={desconto}
              onChange={(e) => setDesconto(Number(e.target.value))}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
          <div className="flex items-center justify-between text-sm text-neutral-400">
            <span>Total</span>
            <span className="text-lg font-semibold text-white">{formatBRL(total)}</span>
          </div>
          {tipoPagamento === "a_prazo" && numeroParcelas > 0 && (
            <p className="mt-1 text-xs text-neutral-500">
              {numeroParcelas}x de {formatBRL(valorParcela)}
            </p>
          )}
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={isPending || carrinho.length === 0}
          className="rounded-lg bg-emerald-500 px-4 py-3 text-sm font-medium text-neutral-950 hover:bg-emerald-400 disabled:opacity-50"
        >
          {isPending ? "Registrando..." : "Registrar venda"}
        </button>
      </div>
    </form>
  );
}
