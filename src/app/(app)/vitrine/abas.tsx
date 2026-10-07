"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { IconChevronLeft } from "@/components/icons";
import { Segmentos } from "@/components/ui";

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

      {/* mesmo controle segmentado dos filtros do app: divide a largura toda */}
      <div className="mt-5 hidden sm:block">
        <Segmentos
          rotulo="Seções da vitrine"
          substituir={false}
          itens={ABAS.map((a) => ({
            href: a.href,
            label: a.label,
            ativo: a.href === "/vitrine" ? pathname === a.href : pathname.startsWith(a.href),
          }))}
        />
      </div>
    </div>
  );
}

// Personalizar ganha largura no computador para a prévia da loja ficar ao lado do formulário
export function LarguraVitrine({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const larga = pathname.startsWith("/vitrine/personalizar");
  return <div className={`mx-auto max-w-2xl ${larga ? "lg:max-w-5xl" : ""}`}>{children}</div>;
}
