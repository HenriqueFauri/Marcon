"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { IconChevronLeft } from "@/components/icons";

export const SECOES_VITRINE = [
  { href: "/vitrine/produtos", label: "Produtos" },
  { href: "/vitrine/personalizar", label: "Personalizar" },
  { href: "/vitrine/configuracoes", label: "Configurações" },
  { href: "/vitrine/cupons", label: "Cupons" },
];

const ABAS = [{ href: "/vitrine", label: "Visão geral" }, ...SECOES_VITRINE];

// Cabeçalho do menu Vitrine. No computador: título e abas. No celular, como no Ajustes do iPhone:
// a visão geral lista as seções e cada seção tem o próprio título com "‹ Vitrine" para voltar.
export function CabecalhoVitrine({ selo }: { selo: ReactNode }) {
  const pathname = usePathname();
  const secao = SECOES_VITRINE.find((s) => pathname.startsWith(s.href));

  return (
    <div className="mb-6">
      {secao && (
        <Link href="/vitrine" className="-ml-1 mb-1 inline-flex items-center gap-0.5 text-[15px] font-medium text-brand-text sm:hidden">
          <IconChevronLeft width={18} height={18} />
          Vitrine
        </Link>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-[28px] font-bold leading-tight tracking-tight text-ink">
          <span className="sm:hidden">{secao?.label ?? "Vitrine"}</span>
          <span className="hidden sm:inline">Vitrine</span>
        </h1>
        <span className={secao ? "hidden sm:inline-flex" : "inline-flex"}>{selo}</span>
      </div>

      <nav aria-label="Seções da vitrine" className="mt-5 hidden sm:block">
        <ul className="inline-flex gap-0.5 rounded-full bg-fill p-[3px]">
          {ABAS.map((a) => {
            const ativa = a.href === "/vitrine" ? pathname === a.href : pathname.startsWith(a.href);
            return (
              <li key={a.href}>
                <Link
                  href={a.href}
                  aria-current={ativa ? "page" : undefined}
                  className={`block whitespace-nowrap rounded-full px-4 py-2 text-[13px] transition ${
                    ativa ? "bg-surface font-semibold text-ink shadow-sm" : "font-medium text-ink-2 hover:text-ink"
                  }`}
                >
                  {a.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

// Personalizar ganha largura no computador para a prévia da loja ficar ao lado do formulário
export function LarguraVitrine({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const larga = pathname.startsWith("/vitrine/personalizar");
  return <div className={`mx-auto max-w-2xl ${larga ? "lg:max-w-5xl" : ""}`}>{children}</div>;
}
