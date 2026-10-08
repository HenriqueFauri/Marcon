"use client";

import type { ReactNode } from "react";

// Peças das telas da vitrine. Grupo, Interruptor e LinhaLink passaram para src/components/ajustes.tsx
// (são usadas em outras áreas também) e continuam exportadas daqui para as telas da vitrine.
export { Grupo, Interruptor, LinhaLink } from "@/components/ajustes";

// controle segmentado (como o Hoje / Semana / Mês do Início); grava num input escondido
export function Segmentado<T extends string>({
  name,
  valor,
  opcoes,
  onMudar,
  rotulo,
}: {
  name?: string;
  valor: T;
  opcoes: { valor: T; label: ReactNode }[];
  onMudar: (v: T) => void;
  rotulo: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={rotulo}
      className="grid gap-0.5 rounded-full bg-fill p-[3px]"
      style={{ gridTemplateColumns: `repeat(${opcoes.length}, minmax(0, 1fr))` }}
    >
      {name && <input type="hidden" name={name} value={valor} />}
      {opcoes.map((o) => (
        <button
          key={o.valor}
          type="button"
          role="radio"
          aria-checked={valor === o.valor}
          onClick={() => onMudar(o.valor)}
          className={`truncate rounded-full px-2 py-2 text-[13px] transition ${
            valor === o.valor ? "bg-surface font-semibold text-ink shadow-sm" : "font-medium text-ink-2 hover:text-ink"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
