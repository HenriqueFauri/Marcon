"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ABAS = [
  { href: "/vitrine", label: "Visão geral" },
  { href: "/vitrine/produtos", label: "Produtos" },
  { href: "/vitrine/personalizar", label: "Personalizar" },
  { href: "/vitrine/configuracoes", label: "Configurações" },
  { href: "/vitrine/cupons", label: "Cupons" },
];

export function AbasVitrine() {
  const pathname = usePathname();
  return (
    <nav aria-label="Seções da vitrine" className="-mx-4 mb-6 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <ul className="flex w-max gap-1 rounded-full bg-fill p-1">
        {ABAS.map((a) => {
          const ativa = a.href === "/vitrine" ? pathname === a.href : pathname.startsWith(a.href);
          return (
            <li key={a.href}>
              <Link
                href={a.href}
                aria-current={ativa ? "page" : undefined}
                className={`block whitespace-nowrap rounded-full px-3.5 py-1.5 text-[14px] font-medium transition ${
                  ativa ? "bg-surface text-ink shadow-sm" : "text-ink-2 hover:text-ink"
                }`}
              >
                {a.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
