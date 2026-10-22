"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { buscarGeral, type ResultadoBusca } from "@/app/(app)/busca/actions";
import { IconSearch } from "./icons";

const GRUPOS: { chave: keyof ResultadoBusca; titulo: string; href: (id: string, titulo: string) => string }[] = [
  { chave: "produtos", titulo: "Produtos", href: (id) => `/produtos/${id}` },
  { chave: "clientes", titulo: "Clientes", href: (_id, titulo) => `/clientes?q=${encodeURIComponent(titulo)}` },
  { chave: "vendas", titulo: "Vendas", href: (id) => `/vendas/${id}` },
];

// Busca que acha produto, cliente e venda de qualquer tela. O atalho "/" abre, menos na Nova venda
// e enquanto a pessoa digita em algum campo. Com a barra lateral e a de cima na página, só abre a que está visível.
export function BuscaGlobal({ variante }: { variante: "barra" | "icone" }) {
  const ref = useRef<HTMLDialogElement>(null);
  const gatilho = useRef<HTMLButtonElement>(null);
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState("");
  const [resultado, setResultado] = useState<ResultadoBusca | null>(null);
  const [buscando, setBuscando] = useState(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (aberto && !dialog.open) dialog.showModal();
    if (!aberto && dialog.open) dialog.close();
  }, [aberto]);

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const alvo = e.target as HTMLElement | null;
      if (alvo && (alvo.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName))) return;
      if (window.location.pathname.startsWith("/vendas/novo")) return;
      if (document.querySelector("dialog[open]")) return;
      if (!gatilho.current || gatilho.current.offsetParent === null) return;
      e.preventDefault();
      setAberto(true);
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, []);

  useEffect(() => {
    const termo = texto.trim();
    if (termo.length < 2) return;
    let atual = true;
    const t = setTimeout(async () => {
      setBuscando(true);
      try {
        const r = await buscarGeral(termo);
        if (atual) setResultado(r);
      } catch {
        if (atual) setResultado(null);
      } finally {
        if (atual) setBuscando(false);
      }
    }, 250);
    return () => {
      atual = false;
      clearTimeout(t);
    };
  }, [texto]);

  const total = resultado ? resultado.produtos.length + resultado.clientes.length + resultado.vendas.length : 0;

  return (
    <>
      {variante === "barra" ? (
        <button
          ref={gatilho}
          type="button"
          onClick={() => setAberto(true)}
          aria-label="Buscar produto, cliente ou venda"
          className="flex min-h-11 w-full items-center gap-2 rounded-xl bg-fill px-3 text-[14px] text-ink-muted"
        >
          <IconSearch width={16} height={16} strokeWidth={2.2} />
          <span className="flex-1 text-left">Buscar</span>
          <kbd className="rounded-md border border-line px-1.5 text-xs">/</kbd>
        </button>
      ) : (
        <button
          ref={gatilho}
          type="button"
          onClick={() => setAberto(true)}
          aria-label="Buscar produto, cliente ou venda"
          className="glass flex h-11 w-11 items-center justify-center rounded-full text-ink shadow-sm ring-1 ring-line/60"
        >
          <IconSearch width={20} height={20} strokeWidth={2.2} />
        </button>
      )}

      <dialog
        ref={ref}
        aria-label="Busca"
        onClose={() => setAberto(false)}
        onClick={(e) => {
          if (e.target === ref.current) setAberto(false);
        }}
        className="m-0 mx-auto mt-[max(1rem,env(safe-area-inset-top))] max-h-[85dvh] w-[calc(100%-2rem)] max-w-xl rounded-3xl bg-surface p-0 text-ink backdrop:bg-black/40 backdrop:backdrop-blur-sm sm:mt-[12dvh]"
      >
        <div className="flex flex-col gap-3 p-4">
          <div className="flex items-center gap-2 rounded-xl bg-fill px-3">
            <IconSearch width={18} height={18} className="shrink-0 text-ink-muted" />
            <input
              type="search"
              autoFocus
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Produto, cliente ou venda"
              aria-label="Buscar produto, cliente ou venda"
              className="min-h-11 w-full bg-transparent text-[17px] text-ink outline-none placeholder:text-ink-muted"
            />
          </div>
          <div aria-live="polite" className="max-h-[60dvh] overflow-y-auto">
            {texto.trim().length < 2 ? (
              <p className="px-1 py-3 text-sm text-ink-muted">Digite pelo menos 2 letras.</p>
            ) : buscando && !resultado ? (
              <p className="px-1 py-3 text-sm text-ink-muted">Buscando...</p>
            ) : resultado && total === 0 ? (
              <p className="px-1 py-3 text-sm text-ink-muted">Nada encontrado para “{texto.trim()}”.</p>
            ) : (
              resultado &&
              GRUPOS.filter((g) => resultado[g.chave].length > 0).map((g) => (
                <section key={g.chave} className="pb-2">
                  <h2 className="px-1 pb-1 pt-2 text-[13px] uppercase text-ink-muted">{g.titulo}</h2>
                  <ul>
                    {resultado[g.chave].map((r) => (
                      <li key={r.id}>
                        <Link
                          href={g.href(r.id, r.titulo)}
                          onClick={() => setAberto(false)}
                          className="flex min-h-11 flex-col justify-center rounded-xl px-2 py-1.5 hover:bg-fill"
                        >
                          <span className="truncate text-[15px] text-ink">{r.titulo}</span>
                          {r.detalhe && <span className="truncate text-xs text-ink-muted">{r.detalhe}</span>}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ))
            )}
          </div>
        </div>
      </dialog>
    </>
  );
}
