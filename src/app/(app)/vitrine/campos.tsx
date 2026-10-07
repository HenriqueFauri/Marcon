"use client";

import Link from "next/link";
import type { ReactNode } from "react";

// Peças das telas da vitrine no padrão do Início (Ajustes do iPhone): grupos com título pequeno
// em cima, linhas com interruptor e controles segmentados.

export function Grupo({
  titulo,
  rodape,
  children,
  semPadding = false,
}: {
  titulo?: ReactNode;
  rodape?: ReactNode;
  children: ReactNode;
  semPadding?: boolean;
}) {
  return (
    <section>
      {titulo && <h2 className="mb-1.5 px-4 text-[13px] uppercase text-ink-muted">{titulo}</h2>}
      <div className={`hairline overflow-hidden rounded-3xl bg-surface ${semPadding ? "" : "flex flex-col gap-4 p-4 sm:p-5"}`}>
        {children}
      </div>
      {rodape && <p className="mt-1.5 px-4 text-[13px] leading-snug text-ink-muted">{rodape}</p>}
    </section>
  );
}

// interruptor do iOS; o checkbox de verdade continua no formulário (name/defaultChecked)
export function Interruptor({ name, padrao, titulo, ajuda }: { name: string; padrao: boolean; titulo: string; ajuda?: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4">
      <span className="min-w-0">
        <span className="block text-[17px] text-ink">{titulo}</span>
        {ajuda && <span className="mt-0.5 block text-[13px] leading-snug text-ink-muted">{ajuda}</span>}
      </span>
      <input type="checkbox" name={name} defaultChecked={padrao} className="peer sr-only" />
      <span
        aria-hidden="true"
        className="relative h-[31px] w-[51px] shrink-0 rounded-full bg-fill-strong transition-colors after:absolute after:left-[2px] after:top-[2px] after:h-[27px] after:w-[27px] after:rounded-full after:bg-white after:shadow-[0_2px_6px_rgba(0,0,0,0.2)] after:transition-transform peer-checked:bg-positive peer-checked:after:translate-x-5 peer-focus-visible:ring-4 peer-focus-visible:ring-brand/30"
      />
    </label>
  );
}

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

export function LinhaLink({
  href,
  icone,
  tom,
  rotulo,
  detalhe,
}: {
  href: string;
  icone?: ReactNode;
  tom?: string;
  rotulo: ReactNode;
  detalhe?: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 border-t border-line px-4 py-3 text-[17px] text-ink transition first:border-t-0 hover:bg-fill/60 active:bg-fill"
    >
      {icone && <span className={`flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg ${tom}`}>{icone}</span>}
      <span className="min-w-0 flex-1 truncate">{rotulo}</span>
      {detalhe && <span className="max-w-[45%] truncate text-ink-muted">{detalhe}</span>}
      <span aria-hidden="true" className="text-lg text-ink-faint">
        ›
      </span>
    </Link>
  );
}
