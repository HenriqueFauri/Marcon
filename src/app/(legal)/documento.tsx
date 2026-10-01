import Link from "next/link";
import type { ReactNode } from "react";

// Contato que aparece nos documentos. Troque aqui se mudar.
export const CONTATO_EMAIL = "rickfaurialves@gmail.com";
export const ATUALIZADO_EM = "30 de setembro de 2026";

export function Documento({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-surface text-ink">
      <header className="border-b border-line px-5 py-4">
        <div className="mx-auto flex max-w-[720px] items-center justify-between text-sm">
          <Link href="/" className="font-semibold text-brand-text">
            ← Marcon
          </Link>
          <nav className="flex gap-5 text-ink-muted">
            <Link href="/termos" className="hover:text-ink">
              Termos
            </Link>
            <Link href="/privacidade" className="hover:text-ink">
              Privacidade
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-[720px] px-5 py-12 sm:py-16">
        <h1 className="text-[34px] font-bold leading-tight tracking-[-0.03em] sm:text-5xl">{titulo}</h1>
        <p className="mt-2 text-sm text-ink-muted">Atualizado em {ATUALIZADO_EM}</p>
        <div className="mt-10 flex flex-col gap-8 text-[16px] leading-[1.6] text-ink-2">{children}</div>
      </main>
    </div>
  );
}

export function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-[20px] font-semibold tracking-tight text-ink">{titulo}</h2>
      {children}
    </section>
  );
}
