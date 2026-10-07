import type { ReactNode } from "react";

// Peças de formulário das subpáginas da vitrine.

export function Interruptor({ name, padrao, titulo, ajuda }: { name: string; padrao: boolean; titulo: string; ajuda: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-fill/60 px-4 py-3">
      <input type="checkbox" name={name} defaultChecked={padrao} className="mt-0.5 h-4 w-4 accent-brand" />
      <span className="text-sm">
        <span className="font-medium text-ink">{titulo}</span>
        <span className="mt-0.5 block text-xs text-ink-muted">{ajuda}</span>
      </span>
    </label>
  );
}

export function Secao({ titulo, descricao, children }: { titulo: string; descricao?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 border-t border-line pt-5 first:border-t-0 first:pt-0">
      <div>
        <h2 className="text-[15px] font-semibold text-ink">{titulo}</h2>
        {descricao && <p className="mt-0.5 text-xs text-ink-muted">{descricao}</p>}
      </div>
      {children}
    </section>
  );
}
