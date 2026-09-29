import type { Metadata } from "next";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";

export const metadata: Metadata = {
  title: { absolute: "Marcon — a loja inteira na palma da mão" },
  description: "Vendas, estoque, fiado e caixa. Tudo se atualiza sozinho, a cada venda.",
};

const NUMEROS = [
  { valor: "R$ 8.426", rotulo: "vendidos em setembro" },
  { valor: "36,8%", rotulo: "de margem no mês" },
  { valor: "2 toques", rotulo: "pra registrar uma venda" },
];

function Icone({ tamanho, brilho = false }: { tamanho: number; brilho?: boolean }) {
  const id = brilho ? "grande" : "pequeno";
  return (
    <svg viewBox="0 0 512 512" width={tamanho} height={tamanho} role="img" aria-label="Marcon" className="shrink-0">
      <defs>
        <linearGradient id={`g-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e5794a" />
          <stop offset=".55" stopColor="#d45f30" />
          <stop offset="1" stopColor="#d45f30" />
        </linearGradient>
        <linearGradient id={`b-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".45" />
          <stop offset=".45" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="116" fill={brilho ? `url(#g-${id})` : "#d45f30"} />
      {brilho && <rect x="3" y="3" width="506" height="506" rx="113" fill={`url(#b-${id})`} />}
      <path
        transform="translate(127.9 355.4)"
        fill="#fff"
        d="M20.72 0V-198.8H77.5L128.13 -54.04L178.64 -198.8H235.42V0H192.86V-128.8L146.1 -0.5H109.87L63.28 -128.8V0Z"
      />
    </svg>
  );
}

export default function LandingPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-surface text-ink">
      <header className="glass sticky top-0 z-10 flex h-11 items-center justify-between border-b border-line px-4 text-xs sm:justify-center sm:gap-9">
        <Icone tamanho={18} />
        <nav aria-label="Seções" className="hidden items-center gap-9 sm:flex">
          <span>Vendas</span>
          <span>Estoque</span>
          <span>Fiado</span>
          <span>Caixa</span>
        </nav>
        <span className="flex items-center gap-3 sm:absolute sm:right-4">
          <Link href="/login" className="font-medium text-brand-text hover:underline sm:hidden">
            Entrar
          </Link>
          <ThemeToggle variante="icone" />
        </span>
      </header>

      <main className="relative flex flex-1 flex-col items-center overflow-hidden px-5 pb-[190px] pt-16 text-center">
        <div className="drop-shadow-[0_24px_40px_rgba(212,95,48,0.28)] drop-shadow-[0_4px_10px_rgba(0,0,0,0.12)]">
          <Icone tamanho={148} brilho />
        </div>
        <p className="mt-6 text-[19px] font-semibold tracking-tight text-brand-text">Marcon</p>
        <h1 className="mt-[18px] max-w-[980px] text-[44px] font-bold leading-[1.02] tracking-[-0.05em] sm:text-7xl lg:text-[80px]">
          A loja inteira.
          <br />
          Na palma da mão.
        </h1>
        <p className="mt-4 max-w-[640px] text-xl font-medium leading-[1.35] tracking-[-0.015em] text-ink-muted sm:text-2xl">
          Vendas, estoque, fiado e caixa. Tudo se atualiza sozinho, a cada venda.
        </p>
        <div className="mt-8 flex items-center gap-3.5">
          <Link
            href="/login"
            className="inline-flex items-center rounded-full bg-ink px-6 py-3 text-[17px] font-medium text-surface transition active:scale-[0.98]"
          >
            Entrar
          </Link>
          <Link href="/login?modo=signup" className="text-[17px] font-medium text-brand-text hover:underline">
            Criar conta ›
          </Link>
        </div>

        <div
          aria-hidden="true"
          className="absolute -bottom-[170px] left-1/2 grid h-[300px] w-[min(900px,calc(100%-32px))] -translate-x-1/2 grid-cols-3 rounded-t-[48px] bg-panel px-4 pt-7 shadow-[inset_0_0.5px_0_var(--line)] sm:px-12"
        >
          {NUMEROS.map((n) => (
            <div key={n.valor} className="flex flex-col items-center gap-1">
              <span className="text-2xl font-bold tabular-nums tracking-[-0.04em] sm:text-[40px]">{n.valor}</span>
              <span className="text-xs text-ink-muted sm:text-sm">{n.rotulo}</span>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
