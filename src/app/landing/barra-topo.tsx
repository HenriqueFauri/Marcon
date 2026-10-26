"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";

const botaoPrincipal =
  "bg-brand-fill inline-flex items-center justify-center whitespace-nowrap rounded-full text-on-brand font-semibold shadow-sm shadow-brand/30 transition active:scale-[0.98]";

// Barra do topo da landing: mesma ideia do Barbieri. Alta o bastante pra tocar com o dedo, navegação em
// pílulas no computador e, no celular, menu que abre uma lista agrupada com as seções, o tema e os botões.
export function BarraTopo({ secoes, logo }: { secoes: { id: string; rotulo: string }[]; logo: ReactNode }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLElement>(null);

  // abriu sem querer: Escape e toque fora fecham, sem precisar achar o X
  useEffect(() => {
    if (!aberto) return;
    const teclado = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAberto(false);
    };
    const toque = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener("keydown", teclado);
    document.addEventListener("pointerdown", toque);
    return () => {
      document.removeEventListener("keydown", teclado);
      document.removeEventListener("pointerdown", toque);
    };
  }, [aberto]);

  return (
    // o app usa viewport-fit=cover: quem gruda no topo recua do relógio do sistema
    <header ref={ref} className="glass sticky top-0 z-20 w-full border-b border-line pt-[env(safe-area-inset-top,0px)]">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-5 lg:h-16 lg:px-6">
        <a href="#topo" aria-label="Marcon, voltar ao topo" className="flex shrink-0 items-center">
          {logo}
        </a>

        <nav aria-label="Seções" className="hidden items-center gap-1 lg:flex">
          {secoes.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="rounded-full px-3 py-2 text-sm font-medium text-ink-2 transition hover:bg-fill hover:text-ink"
            >
              {s.rotulo}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          <ThemeToggle variante="icone" />
          <Link href="/login" className="rounded-md px-3 py-2 text-sm font-medium text-ink-2 transition hover:text-ink">
            Entrar
          </Link>
          <Link href="/login?modo=signup" className={`${botaoPrincipal} px-5 py-2 text-sm`}>
            Começar grátis
          </Link>
        </div>

        <div className="flex items-center gap-2 lg:hidden">
          <Link href="/login?modo=signup" className={`${botaoPrincipal} px-4 py-2 text-[15px]`}>
            Começar grátis
          </Link>
          <button
            type="button"
            aria-label={aberto ? "Fechar menu" : "Abrir menu"}
            aria-expanded={aberto}
            aria-controls="menu-landing"
            onClick={() => setAberto((v) => !v)}
            className="inline-flex size-11 items-center justify-center rounded-full text-ink transition hover:bg-fill"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              {aberto ? (
                <>
                  <path d="M6 6l12 12" />
                  <path d="M18 6L6 18" />
                </>
              ) : (
                <>
                  <path d="M4 7h16" />
                  <path d="M4 17h16" />
                </>
              )}
            </svg>
          </button>
        </div>
      </div>

      {aberto && (
        <div id="menu-landing" className="border-t border-line lg:hidden">
          <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-4">
            <div className="hairline overflow-hidden rounded-[22px] bg-surface">
              {secoes.map((s) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  onClick={() => setAberto(false)}
                  className="flex items-center justify-between border-t border-line px-4 py-3 text-[17px] text-ink transition first:border-t-0 hover:bg-fill"
                >
                  {s.rotulo}
                  <span aria-hidden="true" className="text-lg text-ink-muted">
                    ›
                  </span>
                </a>
              ))}
              <div className="flex items-center justify-between border-t border-line px-4 py-2">
                <span className="text-[17px] text-ink">Tema</span>
                <ThemeToggle />
              </div>
            </div>
            <Link
              href="/login"
              onClick={() => setAberto(false)}
              className="hairline rounded-full bg-surface px-4 py-3 text-center text-[17px] font-medium text-ink"
            >
              Entrar
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
