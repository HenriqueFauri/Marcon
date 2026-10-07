"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Modal } from "@/components/modal";
import { formatBRL } from "@/lib/format";
import {
  TOKENS_ESCUROS,
  corDoTexto,
  linkDoWhatsapp,
  mensagemDoPedido,
  totalDoPedido,
  type ItemDoPedido,
  type Vitrine,
  type VitrineProduto,
} from "@/lib/vitrine";

interface ItemDoCarrinho extends ItemDoPedido {
  chave: string;
}

const chaveDe = (produtoId: string, variacaoId: string | null) => `${produtoId}:${variacaoId ?? ""}`;

function precoInicial(p: VitrineProduto) {
  const precos = p.tem_variacoes && p.variacoes.length > 0 ? p.variacoes.map((v) => Number(v.preco)) : [Number(p.preco)];
  return { menor: Math.min(...precos), varia: Math.min(...precos) !== Math.max(...precos) };
}

function fotoDe(p: VitrineProduto, variacaoId: string | null = null) {
  return (
    p.fotos.find((f) => variacaoId && f.variacaoId === variacaoId) ??
    p.fotos.find((f) => f.variacaoId === null) ??
    p.fotos[0] ??
    null
  );
}

export function Loja({ slug, vitrine }: { slug: string; vitrine: Vitrine }) {
  const { loja, produtos } = vitrine;
  const chaveStorage = `marcon-loja-${slug}`;
  const [carrinho, setCarrinho] = useState<ItemDoCarrinho[]>([]);
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState<string | null>(null);
  const [aberto, setAberto] = useState<VitrineProduto | null>(null);
  const [verCarrinho, setVerCarrinho] = useState(false);
  const [nome, setNome] = useState("");
  const [modo, setModo] = useState<"entrega" | "retirada">(loja.entrega === "retirada" ? "retirada" : "entrega");
  const [endereco, setEndereco] = useState("");
  const [pagamento, setPagamento] = useState("");

  // o carrinho sobrevive a recarregar a página; sem storage (aba privada) segue só em memória
  useEffect(() => {
    try {
      const salvo = JSON.parse(localStorage.getItem(chaveStorage) ?? "[]");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- lê o storage só no navegador, depois da hidratação
      if (Array.isArray(salvo)) setCarrinho(salvo);
    } catch {}
  }, [chaveStorage]);
  useEffect(() => {
    try {
      localStorage.setItem(chaveStorage, JSON.stringify(carrinho));
    } catch {}
  }, [carrinho, chaveStorage]);

  const categorias = useMemo(
    () => [...new Set(produtos.map((p) => p.categoria).filter((c): c is string => !!c))].sort(),
    [produtos],
  );
  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return produtos.filter(
      (p) =>
        (!categoria || p.categoria === categoria) &&
        (!termo || `${p.nome} ${p.marca ?? ""}`.toLowerCase().includes(termo)),
    );
  }, [produtos, busca, categoria]);

  const quantidadeTotal = carrinho.reduce((s, i) => s + i.quantidade, 0);
  const subtotal = totalDoPedido(carrinho);
  const modoFinal = loja.entrega === "ambos" ? modo : loja.entrega;
  const frete = modoFinal === "entrega" ? loja.frete_fixo : null;
  const total = subtotal + (frete ?? 0);
  const faltaEndereco = modoFinal === "entrega" && !endereco.trim();
  const destaques = !busca.trim() && !categoria ? produtos.filter((p) => p.destaque) : [];

  function adicionar(p: VitrineProduto, variacaoId: string | null, quantidade: number) {
    const variacao = variacaoId ? p.variacoes.find((v) => v.id === variacaoId) : null;
    const chave = chaveDe(p.id, variacaoId);
    setCarrinho((atual) => {
      const existente = atual.find((i) => i.chave === chave);
      if (existente) return atual.map((i) => (i.chave === chave ? { ...i, quantidade: i.quantidade + quantidade } : i));
      return [
        ...atual,
        { chave, nome: p.nome, variacao: variacao?.nome ?? null, preco: Number(variacao?.preco ?? p.preco), quantidade },
      ];
    });
    setAberto(null);
  }

  function mudarQuantidade(chave: string, delta: number) {
    setCarrinho((atual) =>
      atual.flatMap((i) => {
        if (i.chave !== chave) return [i];
        const q = i.quantidade + delta;
        return q > 0 ? [{ ...i, quantidade: q }] : [];
      }),
    );
  }

  const estilo = {
    ...(loja.tema === "escuro" ? TOKENS_ESCUROS : {}),
    colorScheme: loja.tema === "escuro" ? "dark" : "light",
    "--loja": loja.cor,
    "--loja-texto": corDoTexto(loja.cor),
  } as CSSProperties;
  const campo =
    "w-full rounded-xl border border-transparent bg-fill px-3.5 py-2.5 text-[15px] text-ink outline-none placeholder:text-ink-muted focus:border-[var(--loja)] focus:bg-surface";
  const botao =
    "inline-flex items-center justify-center rounded-full bg-[var(--loja)] px-5 py-3 text-[15px] font-semibold text-[var(--loja-texto)] shadow-sm transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div style={estilo} className="min-h-dvh bg-canvas text-ink">
      {loja.anuncio && (
        <p className="bg-[var(--loja)] px-4 py-2 text-center text-sm font-medium text-[var(--loja-texto)]">{loja.anuncio}</p>
      )}
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4">
          {loja.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={loja.logoUrl} alt="" className="h-12 w-12 shrink-0 rounded-2xl object-cover" />
          )}
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold tracking-tight">{loja.nome ?? "Loja"}</h1>
            {loja.boas_vindas && <p className="text-sm text-ink-muted">{loja.boas_vindas}</p>}
          </div>
        </div>
        <div className="h-1 bg-[var(--loja)]" />
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-32 pt-4">
        {produtos.length === 0 ? (
          <p className="py-16 text-center text-sm text-ink-muted">Esta loja ainda não tem produtos na vitrine.</p>
        ) : (
          <>
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar produto"
              aria-label="Buscar produto"
              className="w-full rounded-xl border border-transparent bg-fill px-3.5 py-2.5 text-[15px] outline-none placeholder:text-ink-muted focus:border-[var(--loja)] focus:bg-surface"
            />
            {categorias.length > 0 && (
              <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1">
                {[null, ...categorias].map((c) => {
                  const ativo = categoria === c;
                  return (
                    <button
                      key={c ?? "todas"}
                      type="button"
                      onClick={() => setCategoria(c)}
                      aria-pressed={ativo}
                      className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                        ativo ? "bg-[var(--loja)] text-[var(--loja-texto)]" : "bg-fill text-ink-2 hover:bg-fill-strong"
                      }`}
                    >
                      {c ?? "Todos"}
                    </button>
                  );
                })}
              </div>
            )}

            {destaques.length > 0 && (
              <section className="mt-5" aria-label="Destaques">
                <h2 className="mb-2 text-[15px] font-semibold">Destaques</h2>
                <ul className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2">
                  {destaques.map((p) => (
                    <li key={p.id} className="w-40 shrink-0 snap-start">
                      <CartaoDoProduto produto={p} onAbrir={setAberto} />
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {visiveis.length === 0 ? (
              <p className="py-12 text-center text-sm text-ink-muted">Nenhum produto encontrado.</p>
            ) : (
              <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {visiveis.map((p) => (
                  <li key={p.id}>
                    <CartaoDoProduto produto={p} onAbrir={setAberto} />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {(loja.instagram || loja.endereco) && (
          <div className="mt-10 space-y-1 text-center text-sm text-ink-2">
            {loja.instagram && (
              <p>
                <a
                  href={`https://instagram.com/${loja.instagram}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium hover:underline"
                >
                  Instagram @{loja.instagram}
                </a>
              </p>
            )}
            {loja.endereco && <p className="whitespace-pre-line text-ink-muted">{loja.endereco}</p>}
          </div>
        )}

        <p className="mt-6 text-center text-xs text-ink-muted">
          Loja feita com o{" "}
          <a href={loja.ref ? `/?ref=${loja.ref}` : "/"} className="font-medium text-brand-text hover:underline">
            Marcon
          </a>
          , gestão de vendas para quem vende no Marketplace e no WhatsApp.
        </p>
      </main>

      {quantidadeTotal > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-surface/95 px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3 backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center gap-3">
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-semibold tabular-nums">{formatBRL(total)}</p>
              <p className="text-xs text-ink-muted">
                {quantidadeTotal} {quantidadeTotal === 1 ? "item" : "itens"} no pedido
              </p>
            </div>
            <button type="button" onClick={() => setVerCarrinho(true)} className={botao}>
              Ver pedido
            </button>
          </div>
        </div>
      )}

      <Modal open={!!aberto} onClose={() => setAberto(null)} title={aberto?.nome ?? ""} description={aberto?.marca ?? undefined}>
        {aberto && <DetalheDoProduto key={aberto.id} produto={aberto} botao={botao} onAdicionar={adicionar} />}
      </Modal>

      <Modal open={verCarrinho} onClose={() => setVerCarrinho(false)} title="Seu pedido">
        {carrinho.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-muted">Seu pedido está vazio.</p>
        ) : (
          <>
            <ul className="divide-y divide-line">
              {carrinho.map((i) => (
                <li key={i.chave} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium">{i.nome}</p>
                    {i.variacao && <p className="text-xs text-ink-muted">{i.variacao}</p>}
                    <p className="text-xs tabular-nums text-ink-muted">{formatBRL(i.preco)}</p>
                  </div>
                  <Quantidade valor={i.quantidade} onMudar={(d) => mudarQuantidade(i.chave, d)} />
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-col gap-3">
              <input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Seu nome (opcional)"
                aria-label="Seu nome"
                className={campo}
              />
              {loja.entrega === "ambos" && (
                <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Como receber">
                  {(["entrega", "retirada"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      role="radio"
                      aria-checked={modo === m}
                      onClick={() => setModo(m)}
                      className={`rounded-xl border px-3 py-2 text-sm font-medium transition ${
                        modo === m ? "border-[var(--loja)] bg-[var(--loja)] text-[var(--loja-texto)]" : "border-line bg-surface hover:bg-fill"
                      }`}
                    >
                      {m === "entrega" ? "Entrega" : "Retirada"}
                    </button>
                  ))}
                </div>
              )}
              {modoFinal === "entrega" && (
                <textarea
                  value={endereco}
                  onChange={(e) => setEndereco(e.target.value)}
                  rows={2}
                  placeholder="Endereço de entrega"
                  aria-label="Endereço de entrega"
                  className={campo}
                />
              )}
              {loja.formas_pagamento.length > 0 && (
                <select value={pagamento} onChange={(e) => setPagamento(e.target.value)} aria-label="Forma de pagamento" className={campo}>
                  <option value="">Forma de pagamento</option>
                  {loja.formas_pagamento.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <dl className="mt-3 space-y-1 border-t border-line pt-3 text-sm">
              <div className="flex justify-between text-ink-muted">
                <dt>Subtotal</dt>
                <dd className="tabular-nums">{formatBRL(subtotal)}</dd>
              </div>
              {modoFinal === "entrega" && (
                <div className="flex justify-between text-ink-muted">
                  <dt>Frete</dt>
                  <dd className="tabular-nums">{frete ? formatBRL(frete) : "a combinar"}</dd>
                </div>
              )}
            </dl>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-sm text-ink-muted">Total</span>
              <span className="text-lg font-semibold tabular-nums">{formatBRL(total)}</span>
            </div>
            {faltaEndereco ? (
              <button type="button" disabled className={`${botao} mt-4 w-full`}>
                Informe o endereço de entrega
              </button>
            ) : (
              <a
                href={linkDoWhatsapp(
                  loja.whatsapp,
                  mensagemDoPedido(loja.nome, carrinho, {
                    nome: nome.trim(),
                    entrega: modoFinal,
                    endereco: endereco.trim(),
                    pagamento,
                    frete: loja.frete_fixo,
                  }),
                )}
                target="_blank"
                rel="noopener noreferrer"
                className={`${botao} mt-4 w-full`}
              >
                Enviar pedido pelo WhatsApp
              </a>
            )}
            <p className="mt-2 text-center text-xs text-ink-muted">
              O pagamento e a entrega você combina direto com a loja.
            </p>
          </>
        )}
      </Modal>
    </div>
  );
}

function CartaoDoProduto({ produto: p, onAbrir }: { produto: VitrineProduto; onAbrir: (p: VitrineProduto) => void }) {
  const foto = fotoDe(p);
  const { menor, varia } = precoInicial(p);
  const ultimas = p.esgotado ? null : (p.ultimas ?? p.variacoes.find((v) => v.ultimas)?.ultimas ?? null);
  return (
    <button
      type="button"
      onClick={() => onAbrir(p)}
      className="hairline block w-full overflow-hidden rounded-2xl bg-surface text-left transition active:scale-[0.99]"
    >
      <div className="relative aspect-square bg-fill">
        {foto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={foto.url} alt={p.nome} loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-ink-muted">sem foto</div>
        )}
        {p.esgotado && (
          <span className="absolute left-2 top-2 rounded-full bg-black/70 px-2.5 py-1 text-xs font-medium text-white">Esgotado</span>
        )}
        {ultimas !== null && (
          <span className="absolute left-2 top-2 rounded-full bg-amber-500 px-2.5 py-1 text-xs font-semibold text-black">
            {ultimas === 1 ? "Última unidade" : `Últimas ${ultimas}`}
          </span>
        )}
      </div>
      <div className="p-3">
        <p className="line-clamp-2 text-sm font-medium leading-snug">{p.nome}</p>
        <p className="mt-1 text-[15px] font-semibold tabular-nums">
          {varia && <span className="mr-1 text-xs font-normal text-ink-muted">a partir de</span>}
          {formatBRL(menor)}
        </p>
      </div>
    </button>
  );
}

function Quantidade({ valor, onMudar }: { valor: number; onMudar: (delta: number) => void }) {
  const base = "flex h-8 w-8 items-center justify-center rounded-full bg-fill text-base font-semibold hover:bg-fill-strong";
  return (
    <div className="flex shrink-0 items-center gap-2">
      <button type="button" aria-label="Tirar um" onClick={() => onMudar(-1)} className={base}>
        −
      </button>
      <span className="w-6 text-center text-sm tabular-nums">{valor}</span>
      <button type="button" aria-label="Colocar mais um" onClick={() => onMudar(1)} className={base}>
        +
      </button>
    </div>
  );
}

function DetalheDoProduto({
  produto,
  botao,
  onAdicionar,
}: {
  produto: VitrineProduto;
  botao: string;
  onAdicionar: (p: VitrineProduto, variacaoId: string | null, quantidade: number) => void;
}) {
  const comVariacoes = produto.tem_variacoes && produto.variacoes.length > 0;
  const [variacaoId, setVariacaoId] = useState<string | null>(null);
  const [quantidade, setQuantidade] = useState(1);
  const variacao = produto.variacoes.find((v) => v.id === variacaoId) ?? null;
  const foto = fotoDe(produto, variacaoId);
  const fotos = produto.fotos.filter((f) => f.variacaoId === null || f.variacaoId === variacaoId);
  const galeria = fotos.length > 0 ? fotos : foto ? [foto] : [];
  const preco = variacao ? Number(variacao.preco) : precoInicial(produto).menor;
  const varia = !variacao && comVariacoes && precoInicial(produto).varia;
  const indisponivel = comVariacoes ? !variacao || variacao.esgotado : produto.esgotado;

  return (
    <div>
      {galeria.length > 0 && (
        <div className="-mx-1 mb-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1">
          {galeria.map((f) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={f.url} src={f.url} alt={produto.nome} className="aspect-square w-full shrink-0 snap-center rounded-2xl bg-fill object-cover" />
          ))}
        </div>
      )}
      {!comVariacoes && produto.ultimas !== null && !produto.esgotado && (
        <p className="mb-1 text-xs font-semibold text-amber-600">
          {produto.ultimas === 1 ? "Última unidade!" : `Últimas ${produto.ultimas} unidades!`}
        </p>
      )}
      <p className="text-xl font-semibold tabular-nums">
        {varia && <span className="mr-1 text-sm font-normal text-ink-muted">a partir de</span>}
        {formatBRL(preco)}
      </p>
      {produto.descricao && <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink-2">{produto.descricao}</p>}

      {comVariacoes && (
        <fieldset className="mt-4">
          <legend className="mb-2 text-[13px] font-medium text-ink-muted">Escolha uma opção</legend>
          <div className="flex flex-wrap gap-2">
            {produto.variacoes.map((v) => {
              const ativo = v.id === variacaoId;
              return (
                <button
                  key={v.id}
                  type="button"
                  disabled={v.esgotado}
                  aria-pressed={ativo}
                  onClick={() => setVariacaoId(v.id)}
                  className={`rounded-full border px-3.5 py-1.5 text-sm transition disabled:cursor-not-allowed disabled:text-ink-muted disabled:line-through disabled:opacity-60 ${
                    ativo ? "border-[var(--loja)] bg-[var(--loja)] font-medium text-[var(--loja-texto)]" : "border-line bg-surface hover:bg-fill"
                  }`}
                >
                  {v.nome}
                  {v.esgotado && " (esgotado)"}
                  {!v.esgotado && v.ultimas !== null && ` (últimas ${v.ultimas})`}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      <div className="mt-5 flex items-center justify-between gap-3">
        <Quantidade valor={quantidade} onMudar={(d) => setQuantidade((q) => Math.max(1, q + d))} />
        <button
          type="button"
          disabled={indisponivel}
          onClick={() => onAdicionar(produto, variacaoId, quantidade)}
          className={`${botao} flex-1`}
        >
          {produto.esgotado ? "Esgotado" : comVariacoes && !variacao ? "Escolha uma opção" : "Adicionar ao pedido"}
        </button>
      </div>
    </div>
  );
}
