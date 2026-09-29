"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { CanalVenda, Cliente, FormaPagamento } from "@/types/domain";
import { formatBRL, formatData } from "@/lib/format";
import { useAction } from "@/components/use-action";
import { Card, Field, btnIcon, btnIconDanger, btnPrimary, inputClass } from "@/components/ui";
import { IconMinus, IconPlus, IconSearch, IconTrash } from "@/components/icons";
import { registrarVenda } from "../actions";

export interface Vendavel {
  chave: string;
  produto_id: string;
  variacao_id: string | null;
  nome: string;
  detalhe: string;
  preco_varejo: number;
  preco_atacado: number | null;
  custo: number;
  estoque: number;
}

interface ItemCarrinho {
  chave: string;
  quantidade: number;
  preco: string; // texto pra permitir digitar "12," sem o campo brigar com o usuário
}

function paraNumero(v: string) {
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function somarMeses(dataISO: string, meses: number) {
  const [a, m, d] = dataISO.split("-").map(Number);
  const alvo = new Date(a, m - 1 + meses, 1);
  const ultimoDia = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate();
  alvo.setDate(Math.min(d, ultimoDia));
  return `${alvo.getFullYear()}-${String(alvo.getMonth() + 1).padStart(2, "0")}-${String(alvo.getDate()).padStart(2, "0")}`;
}

// Campo "escolha da lista ou digite": select com os cadastrados + texto livre.
function SelectOuTexto({
  label,
  opcoes,
  id,
  setId,
  texto,
  setTexto,
  placeholder,
  vazio,
}: {
  label: string;
  opcoes: { id: string; nome: string }[];
  id: string;
  setId: (v: string) => void;
  texto: string;
  setTexto: (v: string) => void;
  placeholder: string;
  vazio: string;
}) {
  return (
    <div className="space-y-1.5">
      <Field label={label}>
        {opcoes.length > 0 ? (
          <select value={id} onChange={(e) => setId(e.target.value)} className={inputClass}>
            <option value="">{vazio}</option>
            {opcoes.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nome}
              </option>
            ))}
          </select>
        ) : (
          <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={placeholder} className={inputClass} />
        )}
      </Field>
      {opcoes.length > 0 && !id && (
        <input
          aria-label={`${label} (digitar)`}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder={placeholder}
          className={inputClass}
        />
      )}
    </div>
  );
}

export function VendaForm({
  vendaveis,
  clientes,
  canais,
  formas,
  hoje,
}: {
  vendaveis: Vendavel[];
  clientes: Cliente[];
  canais: CanalVenda[];
  formas: FormaPagamento[];
  hoje: string;
}) {
  const router = useRouter();
  const { isPending, run } = useAction();

  const [busca, setBusca] = useState("");
  const [tabela, setTabela] = useState<"varejo" | "atacado">("varejo");
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([]);
  const [clienteId, setClienteId] = useState("");
  const [clienteNome, setClienteNome] = useState("");
  const [canalId, setCanalId] = useState("");
  const [canalNome, setCanalNome] = useState("");
  const [formaId, setFormaId] = useState("");
  const [formaNome, setFormaNome] = useState("");
  const [desconto, setDesconto] = useState("");
  const [tipoPagamento, setTipoPagamento] = useState<"a_vista" | "a_prazo">("a_vista");
  const [numeroParcelas, setNumeroParcelas] = useState(2);
  const [data, setData] = useState(hoje);
  const [primeiroVencimento, setPrimeiroVencimento] = useState(() => somarMeses(hoje, 1));
  const [erro, setErro] = useState<string | null>(null);

  const porChave = useMemo(() => new Map(vendaveis.map((v) => [v.chave, v])), [vendaveis]);
  const temAtacado = vendaveis.some((v) => v.preco_atacado != null);

  const resultados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const lista = termo
      ? vendaveis.filter((v) => `${v.nome} ${v.detalhe}`.toLowerCase().includes(termo))
      : vendaveis;
    return lista.slice(0, 50);
  }, [busca, vendaveis]);

  const linhas = carrinho
    .map((item) => ({ item, produto: porChave.get(item.chave)! }))
    .filter((l) => l.produto);
  const subtotal = linhas.reduce((s, l) => s + l.item.quantidade * paraNumero(l.item.preco), 0);
  const custo = linhas.reduce((s, l) => s + l.item.quantidade * l.produto.custo, 0);
  const valorDesconto = paraNumero(desconto);
  const total = subtotal - valorDesconto;
  const lucro = total - custo;
  const parcelasValidas = Math.min(Math.max(Math.trunc(numeroParcelas) || 1, 1), 60);
  const valorParcela = parcelasValidas > 0 ? total / parcelasValidas : 0;

  function precoPadrao(v: Vendavel) {
    return tabela === "atacado" && v.preco_atacado != null ? v.preco_atacado : v.preco_varejo;
  }

  function adicionar(v: Vendavel) {
    setErro(null);
    setCarrinho((prev) => {
      const existente = prev.find((i) => i.chave === v.chave);
      if (existente) {
        return prev.map((i) =>
          i.chave === v.chave ? { ...i, quantidade: Math.min(i.quantidade + 1, v.estoque) } : i,
        );
      }
      return [...prev, { chave: v.chave, quantidade: 1, preco: precoPadrao(v).toFixed(2) }];
    });
  }

  function alterarQuantidade(chave: string, quantidade: number) {
    const max = porChave.get(chave)?.estoque ?? 1;
    setCarrinho((prev) =>
      prev.map((i) => (i.chave === chave ? { ...i, quantidade: Math.min(Math.max(quantidade, 1), max) } : i)),
    );
  }

  function trocarTabela(nova: "varejo" | "atacado") {
    setTabela(nova);
    // reaplica o preço da tabela nos itens que já estão no carrinho
    setCarrinho((prev) =>
      prev.map((i) => {
        const v = porChave.get(i.chave);
        if (!v) return i;
        const preco = nova === "atacado" && v.preco_atacado != null ? v.preco_atacado : v.preco_varejo;
        return { ...i, preco: preco.toFixed(2) };
      }),
    );
  }

  function validar() {
    if (linhas.length === 0) return "Adicione pelo menos um produto.";
    if (linhas.some((l) => paraNumero(l.item.preco) < 0)) return "Há um item com preço negativo.";
    if (valorDesconto < 0) return "O desconto não pode ser negativo.";
    if (valorDesconto > subtotal) return "O desconto é maior que o total da venda.";
    if (tipoPagamento === "a_prazo" && !clienteId && !clienteNome.trim())
      return "Informe o cliente — venda a prazo precisa saber de quem cobrar.";
    return null;
  }

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    const problema = validar();
    setErro(problema);
    if (problema) return;

    run(
      () =>
        registrarVenda({
          itens: linhas.map((l) => ({
            produto_id: l.produto.produto_id,
            variacao_id: l.produto.variacao_id,
            quantidade: l.item.quantidade,
            preco_unitario: Math.round(paraNumero(l.item.preco) * 100) / 100,
          })),
          clienteId: clienteId || null,
          clienteNome: clienteNome || null,
          canalId: canalId || null,
          canalNome: canalNome || null,
          formaPagamentoId: formaId || null,
          formaPagamentoNome: formaNome || null,
          tipoPagamento,
          numeroParcelas: parcelasValidas,
          primeiroVencimento,
          desconto: valorDesconto,
          data,
        }).then((r) => {
          if (r.ok && r.id) router.push(`/vendas/${r.id}`);
          return r;
        }),
      { onError: setErro },
    );
  }

  const noCarrinho = new Map(carrinho.map((i) => [i.chave, i.quantidade]));

  return (
    <form onSubmit={enviar} className="grid grid-cols-1 gap-4 lg:grid-cols-5 lg:gap-6">
      <div className="flex flex-col items-center gap-0.5 pb-1 pt-2 lg:hidden" aria-live="polite">
        <span className="text-[15px] text-ink-muted">
          Total · {linhas.length} {linhas.length === 1 ? "item" : "itens"}
        </span>
        <span className="text-[44px] font-bold leading-[1.05] tracking-tight tabular-nums text-ink">{formatBRL(total)}</span>
        {linhas.length > 0 && (
          <span
            className={`mt-1.5 rounded-full px-3 py-1 text-[13px] font-semibold ${
              lucro >= 0 ? "bg-positive-tint text-positive" : "bg-danger-tint text-danger"
            }`}
          >
            {lucro >= 0 ? "Lucro de" : "Prejuízo de"} {formatBRL(Math.abs(lucro))}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-4 lg:col-span-3">
        <Card
          title="Produtos"
          action={
            temAtacado && (
              <div className="flex rounded-full bg-fill p-0.5 text-xs" role="group" aria-label="Tabela de preço">
                {(["varejo", "atacado"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => trocarTabela(t)}
                    aria-pressed={tabela === t}
                    className={`rounded-full px-3 py-1 font-medium capitalize ${tabela === t ? "bg-surface text-ink shadow-sm" : "text-ink-muted"}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            )
          }
        >
          <div className="relative mb-3">
            <IconSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" width={16} height={16} />
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar produto, marca ou SKU..."
              aria-label="Buscar produto"
              className={`${inputClass} pl-9`}
            />
          </div>

          <ul className="max-h-72 divide-y divide-line overflow-y-auto rounded-2xl border border-line">
            {resultados.length === 0 && <li className="px-3 py-6 text-center text-sm text-ink-muted">Nada encontrado.</li>}
            {resultados.map((v) => {
              const qtd = noCarrinho.get(v.chave) ?? 0;
              const esgotado = qtd >= v.estoque;
              return (
                <li key={v.chave}>
                  <button
                    type="button"
                    onClick={() => adicionar(v)}
                    disabled={esgotado}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm transition hover:bg-fill disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-ink">{v.nome}</span>
                      <span className="block truncate text-xs text-ink-muted">
                        {v.estoque - qtd} disponível{v.detalhe ? ` · ${v.detalhe}` : ""}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="tabular-nums text-ink-2">{formatBRL(precoPadrao(v))}</span>
                      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-tint text-brand-text">
                        {qtd > 0 ? <span className="text-xs font-semibold">{qtd}</span> : <IconPlus width={16} height={16} />}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card title={`Carrinho${linhas.length ? ` (${linhas.length})` : ""}`}>
          {linhas.length === 0 ? (
            <p className="py-4 text-center text-sm text-ink-muted">Toque num produto acima para adicionar.</p>
          ) : (
            <ul className="divide-y divide-line">
              {linhas.map(({ item, produto }) => (
                <li key={item.chave} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
                  <div className="min-w-0 flex-1 basis-40">
                    <p className="truncate text-sm text-ink">{produto.nome}</p>
                    <p className="text-xs text-ink-muted">
                      Subtotal {formatBRL(item.quantidade * paraNumero(item.preco))}
                    </p>
                  </div>
                  <div className="flex items-center rounded-lg border border-line-strong">
                    <button
                      type="button"
                      className={btnIcon}
                      aria-label="Diminuir quantidade"
                      onClick={() => alterarQuantidade(item.chave, item.quantidade - 1)}
                      disabled={item.quantidade <= 1}
                    >
                      <IconMinus width={14} height={14} />
                    </button>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={produto.estoque}
                      value={item.quantidade}
                      onChange={(e) => alterarQuantidade(item.chave, Number(e.target.value))}
                      aria-label={`Quantidade de ${produto.nome}`}
                      className="w-10 bg-transparent text-center text-sm text-ink outline-none"
                    />
                    <button
                      type="button"
                      className={btnIcon}
                      aria-label="Aumentar quantidade"
                      onClick={() => alterarQuantidade(item.chave, item.quantidade + 1)}
                      disabled={item.quantidade >= produto.estoque}
                    >
                      <IconPlus width={14} height={14} />
                    </button>
                  </div>
                  <label className="flex items-center gap-1 text-xs text-ink-muted">
                    R$
                    <input
                      inputMode="decimal"
                      value={item.preco}
                      onChange={(e) =>
                        setCarrinho((prev) =>
                          prev.map((i) => (i.chave === item.chave ? { ...i, preco: e.target.value } : i)),
                        )
                      }
                      aria-label={`Preço unitário de ${produto.nome}`}
                      className={`${inputClass.replace("w-full ", "")} w-24 py-1.5 text-right`}
                    />
                  </label>
                  <button
                    type="button"
                    className={btnIconDanger}
                    aria-label={`Remover ${produto.nome}`}
                    onClick={() => setCarrinho((prev) => prev.filter((i) => i.chave !== item.chave))}
                  >
                    <IconTrash width={16} height={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Cliente">
          <SelectOuTexto
            label="Cliente"
            opcoes={clientes}
            id={clienteId}
            setId={setClienteId}
            texto={clienteNome}
            setTexto={setClienteNome}
            placeholder="Ou digite só o nome (sem cadastrar)"
            vazio="Venda avulsa / digitar nome"
          />
        </Card>
      </div>

      <div className="flex flex-col gap-4 lg:col-span-2">
        <Card title="Pagamento">
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-1 rounded-full bg-fill p-1" role="radiogroup" aria-label="Tipo de pagamento">
              {(
                [
                  ["a_vista", "À vista"],
                  ["a_prazo", "A prazo / fiado"],
                ] as const
              ).map(([valor, rotulo]) => (
                <label
                  key={valor}
                  className="cursor-pointer rounded-full py-2 text-center text-[15px] font-medium text-ink-2 transition has-[:checked]:bg-surface has-[:checked]:font-semibold has-[:checked]:shadow-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/40 has-[:checked]:text-ink"
                >
                  <input
                    type="radio"
                    name="tipo_pagamento"
                    value={valor}
                    checked={tipoPagamento === valor}
                    onChange={() => setTipoPagamento(valor)}
                    className="sr-only"
                  />
                  {rotulo}
                </label>
              ))}
            </div>

            {tipoPagamento === "a_prazo" && (
              <div className="grid grid-cols-2 gap-2">
                <Field label="Nº de parcelas">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={60}
                    value={numeroParcelas}
                    onChange={(e) => setNumeroParcelas(Number(e.target.value))}
                    className={inputClass}
                  />
                </Field>
                <Field label="1º vencimento">
                  <input
                    type="date"
                    value={primeiroVencimento}
                    onChange={(e) => setPrimeiroVencimento(e.target.value)}
                    className={inputClass}
                  />
                </Field>
              </div>
            )}

            <SelectOuTexto
              label="Forma de pagamento"
              opcoes={formas}
              id={formaId}
              setId={setFormaId}
              texto={formaNome}
              setTexto={setFormaNome}
              placeholder="PIX, dinheiro, cartão..."
              vazio="Digitar"
            />

            <SelectOuTexto
              label="Canal de venda"
              opcoes={canais}
              id={canalId}
              setId={setCanalId}
              texto={canalNome}
              setTexto={setCanalNome}
              placeholder="Instagram, WhatsApp, loja..."
              vazio="Digitar"
            />

            <div className="grid grid-cols-2 gap-2">
              <Field label="Desconto (R$)">
                <input
                  inputMode="decimal"
                  value={desconto}
                  onChange={(e) => setDesconto(e.target.value)}
                  placeholder="0,00"
                  className={inputClass}
                />
              </Field>
              <Field label="Data da venda">
                <input type="date" value={data} max={hoje} onChange={(e) => setData(e.target.value)} className={inputClass} />
              </Field>
            </div>
          </div>
        </Card>

        <Card className="lg:sticky lg:top-6">
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between text-ink-muted">
              <dt>Subtotal</dt>
              <dd className="tabular-nums">{formatBRL(subtotal)}</dd>
            </div>
            {valorDesconto > 0 && (
              <div className="flex justify-between text-ink-muted">
                <dt>Desconto</dt>
                <dd className="tabular-nums">− {formatBRL(valorDesconto)}</dd>
              </div>
            )}
            <div className="flex items-baseline justify-between pt-1">
              <dt className="text-ink-2">Total</dt>
              <dd className="text-2xl font-semibold tabular-nums text-ink">{formatBRL(total)}</dd>
            </div>
            {linhas.length > 0 && (
              <div className="flex justify-between text-xs">
                <dt className="text-ink-muted">Lucro estimado</dt>
                <dd className={`tabular-nums ${lucro >= 0 ? "text-positive" : "text-danger"}`}>{formatBRL(lucro)}</dd>
              </div>
            )}
          </dl>

          {tipoPagamento === "a_prazo" && total > 0 && (
            <div className="mt-3 rounded-lg bg-fill/60 p-3 text-xs text-ink-muted">
              <p className="mb-1 font-medium text-ink-2">
                {parcelasValidas}x de {formatBRL(valorParcela)}
              </p>
              {primeiroVencimento && (
                <p>
                  {Array.from({ length: Math.min(parcelasValidas, 4) }, (_, i) => formatData(somarMeses(primeiroVencimento, i))).join(", ")}
                  {parcelasValidas > 4 && "..."}
                </p>
              )}
            </div>
          )}

          {erro && (
            <p role="alert" className="mt-3 text-sm text-danger">
              {erro}
            </p>
          )}

          <button type="submit" disabled={isPending || linhas.length === 0} className={`${btnPrimary} mt-4 w-full py-3`}>
            {isPending ? "Registrando..." : `Registrar venda${linhas.length ? ` · ${formatBRL(total)}` : ""}`}
          </button>
        </Card>
      </div>
    </form>
  );
}
