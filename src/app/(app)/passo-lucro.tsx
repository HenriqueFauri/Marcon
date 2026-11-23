"use client";

import Link from "next/link";
import { useEffect, type ReactNode } from "react";

// Cookie lido pelo Início para dar o passo "Ver o lucro da venda" como feito. Fica no aparelho:
// em outro aparelho o passo volta a aparecer até ser aberto lá, o que não atrapalha.
// Mesmo nome em page.tsx (constante de arquivo "use client" não chega ao servidor como valor).
const COOKIE_VIU_LUCRO = "marcon-viu-lucro";

export function LinkPassoLucro({ href, marcar, className, children }: { href: string; marcar: boolean; className: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className={className}
      onClick={() => {
        if (marcar) document.cookie = `${COOKIE_VIU_LUCRO}=1; path=/; max-age=31536000; samesite=lax`;
      }}
    >
      {children}
    </Link>
  );
}

// Quem cai na primeira venda logo depois de registrá-la já viu o lucro: o passo do Início fecha sem outro toque.
export function MarcaViuLucro() {
  useEffect(() => {
    document.cookie = `${COOKIE_VIU_LUCRO}=1; path=/; max-age=31536000; samesite=lax`;
  }, []);
  return null;
}
