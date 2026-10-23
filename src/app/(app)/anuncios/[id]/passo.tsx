import type { ReactNode } from "react";

// título de cada passo da tela do anúncio: número na bolinha + nome, pra ficar claro o que fazer em ordem
export function TituloPasso({ n, children, feito = false }: { n: number; children: ReactNode; feito?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <span
        aria-hidden="true"
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold ${
          feito ? "bg-positive text-white" : "bg-brand-fill text-on-brand"
        }`}
      >
        {feito ? "✓" : n}
      </span>
      <span>
        <span className="sr-only">Passo {n}: </span>
        {children}
      </span>
    </span>
  );
}
