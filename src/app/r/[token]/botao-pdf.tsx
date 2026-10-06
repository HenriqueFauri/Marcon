"use client";

import { useEffect } from "react";
import { btnSecondary } from "@/components/ui";

// "Salvar em PDF" usa a impressão do navegador (no celular: Compartilhar > Salvar em PDF).
// Com `auto`, já abre a janela ao chegar, para o atalho do lojista.
export function BotaoPdf({ auto }: { auto: boolean }) {
  useEffect(() => {
    if (!auto) return;
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, [auto]);

  return (
    <button type="button" onClick={() => window.print()} className={`${btnSecondary} print:hidden`}>
      Baixar PDF
    </button>
  );
}
