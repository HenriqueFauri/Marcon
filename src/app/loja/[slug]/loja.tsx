"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Modal } from "@/components/modal";
import { formatBRL } from "@/lib/format";
import {
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
  const total = totalDoPedido(carrinho);

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

  const estilo = { "--loja": loja.cor, "--loja-texto": corDoTexto(loja.cor) } as CSSProperties;
  const botao =
    "inline-flex items-center justify-center rounded-full bg-[var(--loja)] px-5 py-3 text-[15px] font-semibold text-[var(--loja-texto)] shadow-sm transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div style={estilo} className="min-h-dvh bg-canvas text-ink">
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

            {visiveis.length === 0 ? (
              <p className="py-12 text-center text-sm text-ink-muted">Nenhum produto encontrado.</p>
            ) : (
              <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {visiveis.map((p) => {
                  const foto = fotoDe(p);
                  const { menor, varia } = precoInicial(p);
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => setAberto(p)}
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
                            <span className="absolute left-2 top-2 rounded-full bg-black/70 px-2.5 py-1 text-xs font-medium text-white">
                              Esgotado
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
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}

        <p className="mt-10 text-center text-xs text-ink-muted">
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
            <div className="mt-3 flex items-baseline justify-between border-t border-line pt-3">
              <span className="text-sm text-ink-muted">Total</span>
              <span className="text-lg font-semibold tabular-nums">{formatBRL(total)}</span>
            </div>
            <a
              href={linkDoWhatsapp(loja.whatsapp, mensagemDoPedido(loja.nome, carrinho))}
              target="_blank"
              rel="noopener noreferrer"
              className={`${botao} mt-4 w-full`}
            >
              Enviar pedido pelo WhatsApp
            </a>
            <p className="mt-2 text-center text-xs text-ink-muted">
              O pagamento e a entrega você combina direto com a loja.
            </p>
          </>
        )}
      </Modal>
    </div>
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
