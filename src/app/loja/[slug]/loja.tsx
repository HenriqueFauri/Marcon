"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
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
  type VitrineVariacao,
} from "@/lib/vitrine";

// o carrinho guarda só a chave e a quantidade: nome, preço e foto vêm sempre da loja atual,
// então preço mudado vale na hora e item que sumiu ou esgotou sai sozinho
interface ItemSalvo {
  chave: string;
  quantidade: number;
}

interface LinhaDoCarrinho extends ItemDoPedido {
  chave: string;
  foto: string | null;
}

type Ordem = "recentes" | "menor" | "maior";

const ORDENS: { valor: Ordem; label: string }[] = [
  { valor: "recentes", label: "Mais recentes" },
  { valor: "menor", label: "Menor preço" },
  { valor: "maior", label: "Maior preço" },
];

const SEM_BARRA = "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

const chaveDe = (produtoId: string, variacaoId: string | null) => `${produtoId}:${variacaoId ?? ""}`;

function precoInicial(p: VitrineProduto) {
  const disponiveis = p.variacoes.filter((v) => !v.esgotado);
  const base = p.tem_variacoes && p.variacoes.length > 0 ? (disponiveis.length > 0 ? disponiveis : p.variacoes) : null;
  const precos = base ? base.map((v) => Number(v.preco)) : [Number(p.preco)];
  return { menor: Math.min(...precos), varia: Math.min(...precos) !== Math.max(...precos) };
}

// fotos da variação escolhida primeiro, depois as do produto; sem nenhuma, qualquer foto
function fotosDe(p: VitrineProduto, variacaoId: string | null) {
  const daVariacao = variacaoId ? p.fotos.filter((f) => f.variacaoId === variacaoId) : [];
  const doProduto = p.fotos.filter((f) => f.variacaoId === null);
  const juntas = [...daVariacao, ...doProduto];
  return juntas.length > 0 ? juntas : p.fotos.slice(0, 1);
}

function lerItensSalvos(bruto: unknown): ItemSalvo[] {
  if (!Array.isArray(bruto)) return [];
  return bruto.flatMap((i) =>
    i && typeof i.chave === "string" && Number.isInteger(i.quantidade) && i.quantidade > 0
      ? [{ chave: i.chave, quantidade: Math.min(i.quantidade, 99) }]
      : [],
  );
}

export function Loja({ slug, vitrine }: { slug: string; vitrine: Vitrine }) {
  const { loja, produtos } = vitrine;
  const chaveStorage = `marcon-loja-${slug}`;
  const [itens, setItens] = useState<ItemSalvo[]>([]);
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState<string | null>(null);
  const [ordem, setOrdem] = useState<Ordem>("recentes");
  const [aberto, setAberto] = useState<VitrineProduto | null>(null);
  const [verCarrinho, setVerCarrinho] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [modo, setModo] = useState<"entrega" | "retirada">(loja.entrega === "retirada" ? "retirada" : "entrega");
  const [endereco, setEndereco] = useState("");
  const [pagamento, setPagamento] = useState("");
  const timerAviso = useRef<ReturnType<typeof setTimeout> | null>(null);

  const porId = useMemo(() => new Map(produtos.map((p) => [p.id, p])), [produtos]);

  // carrinho salvo no aparelho e produto aberto pelo link (?p=id); só no navegador, depois da hidratação
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- lê o storage só no navegador
      setItens(lerItensSalvos(JSON.parse(localStorage.getItem(chaveStorage) ?? "[]")));
    } catch {}
    const id = new URLSearchParams(window.location.search).get("p");
    const produto = id ? porId.get(id) : undefined;
    if (produto) setAberto(produto);
  }, [chaveStorage, porId]);
  useEffect(() => {
    try {
      localStorage.setItem(chaveStorage, JSON.stringify(itens));
    } catch {}
  }, [itens, chaveStorage]);

  // o endereço reflete o produto aberto, para dar para copiar e mandar o link
  const abrir = useCallback((p: VitrineProduto | null) => {
    setAberto(p);
    const url = new URL(window.location.href);
    if (p) url.searchParams.set("p", p.id);
    else url.searchParams.delete("p");
    window.history.replaceState(null, "", url);
  }, []);

  function avisar(texto: string) {
    setAviso(texto);
    if (timerAviso.current) clearTimeout(timerAviso.current);
    timerAviso.current = setTimeout(() => setAviso(null), 2200);
  }

  const linhas: LinhaDoCarrinho[] = useMemo(
    () =>
      itens.flatMap((i) => {
        const [produtoId, variacaoId] = i.chave.split(":");
        const p = porId.get(produtoId);
        if (!p) return [];
        const v = variacaoId ? p.variacoes.find((x) => x.id === variacaoId) : null;
        if (variacaoId && !v) return [];
        if (v ? v.esgotado : p.esgotado) return [];
        return [
          {
            chave: i.chave,
            nome: p.nome,
            variacao: v?.nome ?? null,
            preco: Number(v?.preco ?? p.preco),
            quantidade: i.quantidade,
            foto: fotosDe(p, v?.id ?? null)[0]?.url ?? null,
          },
        ];
      }),
    [itens, porId],
  );

  const categorias = useMemo(
    () => [...new Set(produtos.map((p) => p.categoria).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b, "pt-BR")),
    [produtos],
  );
  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const filtrados = produtos.filter(
      (p) =>
        (!categoria || p.categoria === categoria) &&
        (!termo || `${p.nome} ${p.marca ?? ""} ${p.categoria ?? ""}`.toLowerCase().includes(termo)),
    );
    const precoDe = (p: VitrineProduto) => precoInicial(p).menor;
    const ordenados =
      ordem === "recentes" ? filtrados : [...filtrados].sort((a, b) => (ordem === "menor" ? 1 : -1) * (precoDe(a) - precoDe(b)));
    // esgotados sempre no fim, sem sumir da loja
    return [...ordenados.filter((p) => !p.esgotado), ...ordenados.filter((p) => p.esgotado)];
  }, [produtos, busca, categoria, ordem]);
  const destaques = !busca.trim() && !categoria ? produtos.filter((p) => p.destaque && !p.esgotado) : [];

  const quantidadeTotal = linhas.reduce((s, i) => s + i.quantidade, 0);
  const subtotal = totalDoPedido(linhas);
  const modoFinal = loja.entrega === "ambos" ? modo : loja.entrega;
  const frete = modoFinal === "entrega" ? loja.frete_fixo : null;
  const total = subtotal + (frete ?? 0);
  const faltaEndereco = modoFinal === "entrega" && !endereco.trim();
  const linkDuvida = linkDoWhatsapp(loja.whatsapp, "Olá! Vi sua loja e tenho uma dúvida.");

  function adicionar(p: VitrineProduto, variacao: VitrineVariacao | null, quantidade: number) {
    const chave = chaveDe(p.id, variacao?.id ?? null);
    setItens((atual) =>
      atual.some((i) => i.chave === chave)
        ? atual.map((i) => (i.chave === chave ? { ...i, quantidade: Math.min(i.quantidade + quantidade, 99) } : i))
        : [...atual, { chave, quantidade }],
    );
    abrir(null);
    avisar("Adicionado ao pedido");
  }

  function mudarQuantidade(chave: string, delta: number) {
    setItens((atual) =>
      atual.flatMap((i) => {
        if (i.chave !== chave) return [i];
        const q = Math.min(i.quantidade + delta, 99);
        return q > 0 ? [{ ...i, quantidade: q }] : [];
      }),
    );
  }

  const escuro = loja.tema === "escuro";
  const estilo = {
    ...(escuro ? TOKENS_ESCUROS : {}),
    colorScheme: escuro ? "dark" : "light",
    "--loja": loja.cor,
    "--loja-texto": corDoTexto(loja.cor),
  } as CSSProperties;
  const campo =
    "w-full rounded-xl border border-transparent bg-fill px-3.5 py-2.5 text-[15px] text-ink outline-none placeholder:text-ink-muted focus:border-[var(--loja)] focus:bg-surface";
  const botao =
    "inline-flex items-center justify-center rounded-full bg-[var(--loja)] px-5 py-3 text-[15px] font-semibold text-[var(--loja-texto)] shadow-sm transition hover:brightness-105 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50";
  const nomeLoja = loja.nome ?? "Loja";

  return (
    <div style={estilo} className="min-h-dvh bg-canvas text-ink">
      {loja.anuncio && (
        <p className="bg-[var(--loja)] px-4 py-2 text-center text-[13px] font-medium text-[var(--loja-texto)]">{loja.anuncio}</p>
      )}
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4">
          {loja.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={loja.logoUrl} alt="" className="h-12 w-12 shrink-0 rounded-2xl border border-line object-cover" />
          ) : (
            <span
              aria-hidden="true"
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--loja)] text-lg font-bold text-[var(--loja-texto)]"
            >
              {nomeLoja.trim().charAt(0).toUpperCase()}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold tracking-tight">{nomeLoja}</h1>
            {loja.boas_vindas && <p className="text-[13px] leading-snug text-ink-muted">{loja.boas_vindas}</p>}
          </div>
        </div>
      </header>

      {vitrine.banner && <BannerDaLoja banner={vitrine.banner} />}

      <main className="mx-auto max-w-3xl px-4 pb-36 pt-4">
        {produtos.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-fill text-2xl" aria-hidden="true">
              🛍️
            </span>
            <p className="text-[15px] font-medium">Os produtos estão chegando.</p>
            <p className="max-w-xs text-sm text-ink-muted">Enquanto isso, chame a loja no WhatsApp para saber o que tem.</p>
            <a href={linkDuvida} target="_blank" rel="noopener noreferrer" className={`${botao} mt-2`}>
              Chamar no WhatsApp
            </a>
          </div>
        ) : (
          <>
            <div id="produtos" className="scroll-mt-4">
              <input
                type="search"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar produto"
                aria-label="Buscar produto"
                className={campo}
              />
            </div>
            {categorias.length > 0 && (
              <div className={`-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 ${SEM_BARRA}`}>
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
              <section className="mt-6" aria-label="Destaques">
                <h2 className="mb-2.5 text-[15px] font-semibold">Destaques</h2>
                <ul className={`-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 ${SEM_BARRA}`}>
                  {destaques.map((p) => (
                    <li key={p.id} className="w-[42%] max-w-48 shrink-0">
                      <CartaoDoProduto produto={p} onAbrir={abrir} />
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <div className="mt-6 flex items-center justify-between gap-3">
              <h2 className="text-[15px] font-semibold">
                {categoria ?? (busca.trim() ? "Resultados" : "Todos os produtos")}
                <span className="ml-1.5 text-sm font-normal text-ink-muted">{visiveis.length}</span>
              </h2>
              <select
                value={ordem}
                onChange={(e) => setOrdem(e.target.value as Ordem)}
                aria-label="Ordenar produtos"
                className="rounded-full border border-line bg-surface px-3 py-1.5 text-[13px] text-ink-2 outline-none focus:border-[var(--loja)]"
              >
                {ORDENS.map((o) => (
                  <option key={o.valor} value={o.valor}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            {visiveis.length === 0 ? (
              <div className="py-12 text-center text-sm text-ink-muted">
                <p>Nenhum produto encontrado.</p>
                <button
                  type="button"
                  onClick={() => {
                    setBusca("");
                    setCategoria(null);
                  }}
                  className="mt-2 font-medium text-ink underline underline-offset-2"
                >
                  Ver todos
                </button>
              </div>
            ) : (
              <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {visiveis.map((p) => (
                  <li key={p.id}>
                    <CartaoDoProduto produto={p} onAbrir={abrir} />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {(loja.instagram || loja.endereco) && (
          <div className="mt-12 space-y-1.5 border-t border-line pt-6 text-center text-sm text-ink-2">
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
          <a href={loja.ref ? `/?ref=${loja.ref}` : "/"} className="font-medium text-ink-2 underline-offset-2 hover:underline">
            Marcon
          </a>
          , gestão de vendas para quem vende no Marketplace e no WhatsApp.
        </p>
      </main>

      {aviso && (
        <p
          role="status"
          className="fixed inset-x-0 bottom-24 z-20 mx-auto w-fit rounded-full bg-ink px-4 py-2 text-sm font-medium text-canvas shadow-lg"
        >
          {aviso}
        </p>
      )}

      {quantidadeTotal > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-surface/95 px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3 backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center gap-3">
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-semibold tabular-nums">{formatBRL(subtotal)}</p>
              <p className="text-xs text-ink-muted">
                {quantidadeTotal} {quantidadeTotal === 1 ? "item" : "itens"} no pedido
              </p>
            </div>
            <button type="button" onClick={() => setVerCarrinho(true)} className={botao}>
              Ver pedido
            </button>
          </div>
        </div>
      ) : (
        produtos.length > 0 && (
          <a
            href={linkDuvida}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Tirar dúvida no WhatsApp"
            className="fixed bottom-[max(env(safe-area-inset-bottom),1rem)] right-4 z-10 flex h-14 w-14 items-center justify-center rounded-full bg-[#25d366] text-white shadow-lg transition hover:brightness-105 active:scale-95"
          >
            <IconeWhatsapp />
          </a>
        )
      )}

      <Modal open={!!aberto} onClose={() => abrir(null)} title={aberto?.nome ?? ""} description={aberto?.marca ?? undefined}>
        {aberto && (
          <DetalheDoProduto
            key={aberto.id}
            produto={aberto}
            botao={botao}
            onAdicionar={adicionar}
            onAviso={avisar}
          />
        )}
      </Modal>

      <Modal open={verCarrinho} onClose={() => setVerCarrinho(false)} title="Seu pedido">
        {linhas.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-muted">Seu pedido está vazio.</p>
        ) : (
          <>
            <ul className="divide-y divide-line">
              {linhas.map((i) => (
                <li key={i.chave} className="flex items-center gap-3 py-3 text-sm">
                  {i.foto ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={i.foto} alt="" className="h-12 w-12 shrink-0 rounded-xl bg-fill object-cover" />
                  ) : (
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-fill text-ink-muted" aria-hidden="true">
                      {i.nome.charAt(0).toUpperCase()}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 font-medium leading-snug">{i.nome}</p>
                    {i.variacao && <p className="text-xs text-ink-muted">{i.variacao}</p>}
                    <p className="text-xs tabular-nums text-ink-muted">{formatBRL(i.preco * i.quantidade)}</p>
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
                autoComplete="name"
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
              {loja.entrega === "retirada" && <p className="text-xs text-ink-muted">Esta loja trabalha só com retirada.</p>}
              {modoFinal === "entrega" && (
                <textarea
                  value={endereco}
                  onChange={(e) => setEndereco(e.target.value)}
                  rows={2}
                  placeholder="Endereço de entrega (rua, número, bairro)"
                  aria-label="Endereço de entrega"
                  autoComplete="street-address"
                  className={campo}
                />
              )}
              {loja.formas_pagamento.length > 0 && (
                <select value={pagamento} onChange={(e) => setPagamento(e.target.value)} aria-label="Forma de pagamento" className={campo}>
                  <option value="">Forma de pagamento (opcional)</option>
                  {loja.formas_pagamento.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <dl className="mt-4 space-y-1 border-t border-line pt-3 text-sm">
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
              <div className="flex items-baseline justify-between pt-1">
                <dt className="text-ink-muted">Total</dt>
                <dd className="text-lg font-semibold tabular-nums">{formatBRL(total)}</dd>
              </div>
            </dl>
            {faltaEndereco ? (
              <button type="button" disabled className={`${botao} mt-4 w-full`}>
                Informe o endereço de entrega
              </button>
            ) : (
              <a
                href={linkDoWhatsapp(
                  loja.whatsapp,
                  mensagemDoPedido(loja.nome, linhas, {
                    nome: nome.trim(),
                    entrega: modoFinal,
                    endereco: endereco.trim(),
                    pagamento,
                    frete: loja.frete_fixo,
                  }),
                )}
                target="_blank"
                rel="noopener noreferrer"
                className={`${botao} mt-4 w-full gap-2`}
              >
                <IconeWhatsapp />
                Enviar pedido pelo WhatsApp
              </a>
            )}
            <p className="mt-2 text-center text-xs text-ink-muted">O pagamento e a entrega você combina direto com a loja.</p>
          </>
        )}
      </Modal>
    </div>
  );
}

function IconeWhatsapp() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.4a.5.5 0 0 0 0-.4l-.8-1.9c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.1 5.1 0 0 0 1.1 2.7 11.6 11.6 0 0 0 4.4 3.9c1.6.7 2.3.8 3.1.6a2.7 2.7 0 0 0 1.8-1.3 2.2 2.2 0 0 0 .2-1.3c-.1-.1-.3-.2-.5-.3Z" />
    </svg>
  );
}

function Pontos({ total, atual, claro = false }: { total: number; atual: number; claro?: boolean }) {
  if (total < 2) return null;
  return (
    <div className="flex justify-center gap-1.5" aria-hidden="true">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`h-1.5 rounded-full transition-all ${i === atual ? "w-4" : "w-1.5"} ${
            claro ? (i === atual ? "bg-white" : "bg-white/50") : i === atual ? "bg-ink" : "bg-ink/25"
          }`}
        />
      ))}
    </div>
  );
}

function indiceDoScroll(el: HTMLElement) {
  return Math.round(el.scrollLeft / Math.max(el.clientWidth, 1));
}

function BannerDaLoja({ banner }: { banner: NonNullable<Vitrine["banner"]> }) {
  const [indice, setIndice] = useState(0);
  const temTexto = !!(banner.titulo || banner.subtitulo || banner.botao);
  if (banner.urls.length === 0 && !temTexto) return null;
  return (
    <section className="mx-auto max-w-3xl px-4 pt-4" aria-label="Destaque da loja">
      <div className="overflow-hidden rounded-3xl bg-[var(--loja)] text-[var(--loja-texto)]">
        {banner.urls.length > 0 && (
          <div className="relative">
            <div
              className={`flex snap-x snap-mandatory overflow-x-auto ${SEM_BARRA}`}
              onScroll={(e) => setIndice(indiceDoScroll(e.currentTarget))}
            >
              {banner.urls.map((url, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={url}
                  src={url}
                  alt=""
                  loading={i === 0 ? "eager" : "lazy"}
                  className="aspect-[5/2] w-full shrink-0 snap-center bg-fill object-cover"
                />
              ))}
            </div>
            <div className="absolute inset-x-0 bottom-2.5">
              <Pontos total={banner.urls.length} atual={indice} claro />
            </div>
          </div>
        )}
        {temTexto && (
          <div className="flex flex-col gap-1 px-5 py-4">
            {banner.titulo && <h2 className="text-lg font-bold leading-tight sm:text-xl">{banner.titulo}</h2>}
            {banner.subtitulo && <p className="text-sm opacity-90">{banner.subtitulo}</p>}
            {banner.botao && (
              <a
                href="#produtos"
                className="mt-2 inline-flex w-fit rounded-full bg-[var(--loja-texto)] px-4 py-2 text-sm font-semibold text-[var(--loja)] transition hover:opacity-90"
              >
                {banner.botao}
              </a>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function SemFoto({ nome }: { nome: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 text-ink-muted">
      <span className="text-3xl font-semibold opacity-40">{nome.trim().charAt(0).toUpperCase()}</span>
      <span className="text-[11px]">sem foto</span>
    </div>
  );
}

function CartaoDoProduto({ produto: p, onAbrir }: { produto: VitrineProduto; onAbrir: (p: VitrineProduto) => void }) {
  const foto = fotosDe(p, null)[0];
  const { menor, varia } = precoInicial(p);
  const ultimas = p.esgotado ? null : (p.ultimas ?? p.variacoes.find((v) => v.ultimas)?.ultimas ?? null);
  return (
    <button
      type="button"
      onClick={() => onAbrir(p)}
      className="hairline block h-full w-full overflow-hidden rounded-2xl bg-surface text-left transition hover:shadow-md active:scale-[0.99]"
    >
      <div className="relative aspect-square bg-fill">
        {foto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={foto.url}
            alt={p.nome}
            loading="lazy"
            className={`h-full w-full object-cover ${p.esgotado ? "opacity-50 grayscale" : ""}`}
          />
        ) : (
          <SemFoto nome={p.nome} />
        )}
        {p.esgotado && (
          <span className="absolute left-2 top-2 rounded-full bg-black/75 px-2.5 py-1 text-[11px] font-semibold text-white">Esgotado</span>
        )}
        {ultimas !== null && (
          <span className="absolute left-2 top-2 rounded-full bg-amber-400 px-2.5 py-1 text-[11px] font-semibold text-black">
            {ultimas === 1 ? "Última unidade" : `Últimas ${ultimas}`}
          </span>
        )}
      </div>
      <div className="p-3">
        <p className="line-clamp-2 min-h-[2.5em] text-[13px] font-medium leading-snug">{p.nome}</p>
        <p className={`mt-1 text-[15px] font-semibold tabular-nums ${p.esgotado ? "text-ink-muted" : ""}`}>
          {varia && <span className="mr-1 text-[11px] font-normal text-ink-muted">a partir de</span>}
          {formatBRL(menor)}
        </p>
      </div>
    </button>
  );
}

function Quantidade({ valor, onMudar }: { valor: number; onMudar: (delta: number) => void }) {
  const base = "flex h-8 w-8 items-center justify-center rounded-full bg-fill text-base font-semibold transition hover:bg-fill-strong";
  return (
    <div className="flex shrink-0 items-center gap-1.5">
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
  onAviso,
}: {
  produto: VitrineProduto;
  botao: string;
  onAdicionar: (p: VitrineProduto, variacao: VitrineVariacao | null, quantidade: number) => void;
  onAviso: (texto: string) => void;
}) {
  const comVariacoes = produto.tem_variacoes && produto.variacoes.length > 0;
  // com uma opção só disponível, já vem escolhida
  const disponiveis = produto.variacoes.filter((v) => !v.esgotado);
  const [variacaoId, setVariacaoId] = useState<string | null>(comVariacoes && disponiveis.length === 1 ? disponiveis[0].id : null);
  const [quantidade, setQuantidade] = useState(1);
  const [foto, setFoto] = useState(0);
  const galeria = useRef<HTMLDivElement>(null);
  const variacao = produto.variacoes.find((v) => v.id === variacaoId) ?? null;
  const fotos = fotosDe(produto, variacaoId);
  const inicial = precoInicial(produto);
  const preco = variacao ? Number(variacao.preco) : inicial.menor;
  const varia = !variacao && comVariacoes && inicial.varia;
  const indisponivel = comVariacoes ? !variacao || variacao.esgotado : produto.esgotado;
  const ultimas = variacao ? variacao.ultimas : comVariacoes ? null : produto.ultimas;

  function escolher(id: string) {
    setVariacaoId(id);
    setFoto(0);
    galeria.current?.scrollTo({ left: 0 });
  }

  async function compartilhar() {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: produto.nome, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      onAviso("Link do produto copiado");
    } catch {
      // cancelar o compartilhamento não é erro
    }
  }

  return (
    <div>
      {fotos.length > 0 ? (
        <div className="mb-4">
          <div
            ref={galeria}
            className={`-mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 ${SEM_BARRA}`}
            onScroll={(e) => setFoto(indiceDoScroll(e.currentTarget))}
          >
            {fotos.map((f) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={f.url}
                src={f.url}
                alt={produto.nome}
                className="aspect-square w-full shrink-0 snap-center rounded-2xl bg-fill object-cover"
              />
            ))}
          </div>
          <div className="mt-2">
            <Pontos total={fotos.length} atual={foto} />
          </div>
        </div>
      ) : (
        <div className="mb-4 aspect-[4/3] rounded-2xl bg-fill">
          <SemFoto nome={produto.nome} />
        </div>
      )}

      <div className="flex items-start justify-between gap-3">
        <div>
          {ultimas !== null && ultimas !== undefined && !produto.esgotado && (
            <p className="mb-1 text-xs font-semibold text-amber-600">
              {ultimas === 1 ? "Última unidade!" : `Últimas ${ultimas} unidades!`}
            </p>
          )}
          <p className="text-xl font-semibold tabular-nums">
            {varia && <span className="mr-1 text-sm font-normal text-ink-muted">a partir de</span>}
            {formatBRL(preco)}
          </p>
        </div>
        <button
          type="button"
          onClick={compartilhar}
          className="shrink-0 rounded-full border border-line px-3 py-1.5 text-[13px] font-medium text-ink-2 transition hover:bg-fill"
        >
          Compartilhar
        </button>
      </div>
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
                  onClick={() => escolher(v.id)}
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
        <Quantidade valor={quantidade} onMudar={(d) => setQuantidade((q) => Math.min(99, Math.max(1, q + d)))} />
        <button
          type="button"
          disabled={indisponivel}
          onClick={() => onAdicionar(produto, variacao, quantidade)}
          className={`${botao} flex-1`}
        >
          {produto.esgotado ? "Esgotado" : comVariacoes && !variacao ? "Escolha uma opção" : "Adicionar ao pedido"}
        </button>
      </div>
    </div>
  );
}
