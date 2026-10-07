"use client";

import Link from "next/link";
import { IconGrid, IconList } from "@/components/icons";
import { lembrarPreferencia } from "@/lib/cookie";

export type Vista = "lista" | "galeria";

// Alterna entre lista e galeria. A escolha vai na URL (?vista=) e num cookie, para
// a próxima visita à tela abrir do mesmo jeito.
export function VistaToggle({ vista, hrefLista, hrefGaleria }: { vista: Vista; hrefLista: string; hrefGaleria: string }) {
  const opcoes = [
    { valor: "lista" as const, rotulo: "Lista", href: hrefLista, icone: <IconList width={15} height={15} /> },
    { valor: "galeria" as const, rotulo: "Galeria", href: hrefGaleria, icone: <IconGrid width={15} height={15} /> },
  ];

  return (
    <nav className="grid shrink-0 grid-cols-2 gap-0.5 rounded-full bg-fill p-[3px]" aria-label="Forma de exibir">
      {opcoes.map((o) => (
        <Link
          key={o.valor}
          href={o.href}
          replace
          scroll={false}
          onClick={() => lembrarPreferencia("marcon-vista-anuncios", o.valor)}
          aria-current={vista === o.valor ? "page" : undefined}
          aria-label={o.rotulo}
          className={`flex items-center justify-center gap-1.5 rounded-full px-3 py-2 text-[13px] sm:px-3.5 sm:py-1.5 transition ${
            vista === o.valor ? "bg-surface font-semibold text-ink shadow-sm" : "font-medium text-ink-2 hover:text-ink"
          }`}
        >
          {o.icone}
          <span className="hidden sm:inline">{o.rotulo}</span>
        </Link>
      ))}
    </nav>
  );
}
