import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: { absolute: "Marcon — a loja inteira na palma da mão" },
  description: "Vendas, estoque, fiado e caixa. Tudo se atualiza sozinho, a cada venda.",
};

const DESTAQUES = [
  { titulo: "Venda em 2 toques", texto: "Escolha o produto, toque em registrar. O estoque e o caixa se ajustam sozinhos." },
  { titulo: "Fiado sem caderninho", texto: "Parcelas, vencimentos e quem está atrasado, tudo num lugar só." },
  { titulo: "Lucro de verdade", texto: "O custo de cada produto entra na conta, e você vê quanto sobrou no mês." },
];

function Icone({ tamanho }: { tamanho: number }) {
  return (
    <svg viewBox="0 0 512 512" width={tamanho} height={tamanho} role="img" aria-label="Marcon" className="shrink-0">
      <defs>
        <linearGradient id="marcon-g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e5794a" />
          <stop offset=".55" stopColor="#d45f30" />
          <stop offset="1" stopColor="#b85028" />
        </linearGradient>
        <linearGradient id="marcon-brilho" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".45" />
          <stop offset=".45" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="116" fill="url(#marcon-g)" />
      <rect x="3" y="3" width="506" height="506" rx="113" fill="url(#marcon-brilho)" />
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
    <div className="flex min-h-dvh flex-col bg-surface">
      <header className="glass sticky top-0 z-10 flex h-11 items-center justify-between border-b border-line/60 px-4 sm:justify-center sm:gap-9">
        <span className="flex items-center gap-2">
          <Icone tamanho={18} />
          <span className="text-sm font-semibold text-ink">Marcon</span>
        </span>
        <nav aria-label="Seções" className="hidden gap-9 text-xs text-ink sm:flex">
          <span>Vendas</span>
          <span>Estoque</span>
          <span>Fiado</span>
          <span>Caixa</span>
        </nav>
        <Link href="/login" className="text-xs font-medium text-brand-text hover:underline sm:hidden">
          Entrar
        </Link>
      </header>

      <main className="flex flex-1 flex-col items-center px-5 pb-16 pt-14 text-center sm:pt-16">
        <div className="drop-shadow-[0_24px_40px_rgba(212,95,48,0.28)]">
          <Icone tamanho={132} />
        </div>
        <h1 className="mt-8 max-w-4xl text-[44px] font-bold leading-[1.04] tracking-[-0.05em] text-ink sm:text-7xl">
          A loja inteira.
          <br />
          Na palma da mão.
        </h1>
        <p className="mt-5 max-w-xl text-lg font-medium leading-snug tracking-tight text-ink-muted sm:text-2xl">
          Vendas, estoque, fiado e caixa. Tudo se atualiza sozinho, a cada venda.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/login"
            className="inline-flex items-center rounded-full bg-ink px-6 py-3 text-[17px] font-medium text-canvas transition active:scale-[0.98]"
          >
            Entrar
          </Link>
          <Link href="/login?modo=signup" className="text-[17px] font-medium text-brand-text hover:underline">
            Criar conta ›
          </Link>
        </div>

        <ul className="mt-16 grid w-full max-w-4xl grid-cols-1 gap-3 sm:grid-cols-3">
          {DESTAQUES.map((d) => (
            <li key={d.titulo} className="rounded-3xl bg-canvas px-6 py-7 text-left">
              <h2 className="text-[19px] font-semibold tracking-tight text-ink">{d.titulo}</h2>
              <p className="mt-1.5 text-[15px] leading-snug text-ink-muted">{d.texto}</p>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
