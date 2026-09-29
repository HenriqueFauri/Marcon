"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { CanalVenda, Cliente, FormaPagamento } from "@/types/domain";
import { formatBRL, formatData } from "@/lib/format";
import { useAction } from "@/components/use-action";
import { Card, Field, btnPrimary, inputClass } from "@/components/ui";
import { IconBox, IconPlus, IconSearch, IconTrash } from "@/components/icons";
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

// Linha de formulário no estilo iOS: rótulo à esquerda, valor à direita.
function Linha({ rotulo, children, extra }: { rotulo: string; children: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <div className="border-t border-line first:border-t-0">
      <label className="flex items-center justify-between gap-4 py-3">
        <span className="shrink-0 text-[17px] text-ink">{rotulo}</span>
        <span className="min-w-0 flex-1">{children}</span>
      </label>
      {extra && <div className="pb-3">{extra}</div>}
    </div>
  );
}

const valorLinha =
  "w-full min-w-0 cursor-pointer bg-transparent text-right text-[17px] text-ink-muted outline-none placeholder:text-ink-muted focus:text-ink";

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
    <Linha
      rotulo={label}
      extra={
        opcoes.length > 0 && !id ? (
          <input
            aria-label={`${label} (digitar)`}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={placeholder}
            className={inputClass}
          />
        ) : null
      }
    >
      {opcoes.length > 0 ? (
        <select value={id} onChange={(e) => setId(e.target.value)} className={`${valorLinha} [direction:rtl]`}>
          <option value="">{vazio}</option>
          {opcoes.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nome}
            </option>
          ))}
        </select>
      ) : (
        <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={placeholder} className={valorLinha} />
      )}
    </Linha>
  );
}

export function VendaForm({
  vendaveis,
  clientes,
  canais,
  formas,
  hoje,
  produtoInicial,
}: {
  vendaveis: Vendavel[];
  clientes: Cliente[];
  canais: CanalVenda[];
  formas: FormaPagamento[];
  hoje: string;
  produtoInicial?: string | null;
}) {
  const router = useRouter();
  const { isPending, run } = useAction();

  // vindo de "Vender este produto": com uma opção só, já entra no carrinho; com
  // variações, a busca abre filtrada pelo nome pra escolher qual
  const iniciais = produtoInicial ? vendaveis.filter((v) => v.produto_id === produtoInicial) : [];
  const [busca, setBusca] = useState(iniciais.length > 1 ? iniciais[0].nome.split(" — ")[0] : "");
  const [tabela, setTabela] = useState<"varejo" | "atacado">("varejo");
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>(() =>
    iniciais.length === 1 ? [{ chave: iniciais[0].chave, quantidade: 1, preco: iniciais[0].preco_varejo.toFixed(2) }] : [],
  );
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
              id="buscar-produto"
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
            <ul className="-mx-1 divide-y divide-line">
              {linhas.map(({ item, produto }) => (
                <li key={item.chave} className="flex items-center gap-3 px-1 py-2.5">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand-text">
                    <IconBox width={22} height={22} strokeWidth={1.9} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[17px] text-ink">{produto.nome}</p>
                    <label className="flex items-center gap-1 text-[15px] text-ink-muted">
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
                        className="w-20 rounded-md bg-transparent px-1 tabular-nums text-ink-muted outline-none focus:bg-fill focus:text-ink"
                      />
                    </label>
                  </div>
                  <div className="flex items-center rounded-full bg-canvas">
                    <button
                      type="button"
                      className="flex h-[34px] w-[34px] items-center justify-center rounded-full text-xl text-ink disabled:opacity-40"
                      aria-label="Diminuir quantidade"
                      onClick={() =>
                        item.quantidade <= 1
                          ? setCarrinho((prev) => prev.filter((i) => i.chave !== item.chave))
                          : alterarQuantidade(item.chave, item.quantidade - 1)
                      }
                    >
                      {item.quantidade <= 1 ? <IconTrash width={16} height={16} /> : "−"}
                    </button>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={produto.estoque}
                      value={item.quantidade}
                      onChange={(e) => alterarQuantidade(item.chave, Number(e.target.value))}
                      aria-label={`Quantidade de ${produto.nome}`}
                      className="w-8 bg-transparent text-center text-[17px] font-semibold tabular-nums text-ink outline-none"
                    />
                    <button
                      type="button"
                      className="flex h-[34px] w-[34px] items-center justify-center rounded-full text-xl text-ink disabled:opacity-40"
                      aria-label="Aumentar quantidade"
                      onClick={() => alterarQuantidade(item.chave, item.quantidade + 1)}
                      disabled={item.quantidade >= produto.estoque}
                    >
                      +
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={() => {
              document.getElementById("buscar-produto")?.focus();
              document.getElementById("buscar-produto")?.scrollIntoView({ behavior: "smooth", block: "center" });
            }}
            className="mt-1 flex w-full items-center gap-3 border-t border-line px-1 pt-3 text-left text-[17px] text-brand-text"
          >
            <span className="flex w-11 justify-center">
              <IconPlus width={22} height={22} strokeWidth={2.2} />
            </span>
            Adicionar produto
          </button>
        </Card>

        <Card title="Cliente" className="!py-2 sm:!py-2">
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

            <div className="-mb-3">
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
            <Linha rotulo="Desconto (R$)">
              <input
                inputMode="decimal"
                value={desconto}
                onChange={(e) => setDesconto(e.target.value)}
                placeholder="0,00"
                className={valorLinha}
              />
            </Linha>
            <Linha rotulo="Data da venda">
              <input type="date" value={data} max={hoje} onChange={(e) => setData(e.target.value)} className={valorLinha} />
            </Linha>
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

          <div className="fixed inset-x-0 bottom-0 z-40 bg-gradient-to-t from-canvas via-canvas/90 to-transparent px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-8 lg:static lg:mt-4 lg:bg-none lg:p-0">
            <button
              type="submit"
              disabled={isPending || linhas.length === 0}
              className={`${btnPrimary} h-[54px] w-full !text-[17px] shadow-lg shadow-brand/30 lg:h-auto lg:py-3 lg:shadow-sm`}
            >
              {isPending ? "Registrando..." : `Registrar venda${linhas.length ? ` · ${formatBRL(total)}` : ""}`}
            </button>
          </div>
        </Card>
      </div>
    </form>
  );
}
