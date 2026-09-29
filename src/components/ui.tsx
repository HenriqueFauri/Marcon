import Link from "next/link";
import type { ReactNode } from "react";

// Classes compartilhadas: mantêm o visual consistente entre telas sem precisar
// de uma biblioteca de componentes.
export const inputClass =
  "w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white outline-none transition placeholder:text-neutral-500 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50";

const btnBase =
  "inline-flex items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 disabled:cursor-not-allowed disabled:opacity-50";

export const btnPrimary = `${btnBase} bg-emerald-500 px-4 py-2 text-neutral-950 hover:bg-emerald-400`;
export const btnSecondary = `${btnBase} border border-neutral-700 bg-neutral-800 px-4 py-2 text-white hover:bg-neutral-700`;
export const btnGhost = `${btnBase} px-3 py-2 text-neutral-300 hover:bg-neutral-800 hover:text-white`;
export const btnDanger = `${btnBase} bg-red-500 px-4 py-2 text-white hover:bg-red-400`;
export const btnIcon =
  "inline-flex h-8 w-8 items-center justify-center rounded-md text-neutral-400 transition hover:bg-neutral-800 hover:text-white disabled:opacity-50";
export const btnIconDanger =
  "inline-flex h-8 w-8 items-center justify-center rounded-md text-neutral-400 transition hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50";

export function PageHeader({
  title,
  description,
  action,
  back,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <div className="mb-6">
      {back && (
        <Link href={back.href} className="mb-2 inline-block text-xs text-neutral-400 hover:text-white">
          ← {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-white">{title}</h1>
          {description && <p className="mt-0.5 text-sm text-neutral-400">{description}</p>}
        </div>
        {action && <div className="flex shrink-0 flex-wrap gap-2">{action}</div>}
      </div>
    </div>
  );
}

export function Card({
  title,
  description,
  action,
  children,
  className = "",
}: {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-neutral-800 bg-neutral-900 p-4 sm:p-5 ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            {title && <h2 className="text-sm font-semibold text-white">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-neutral-500">{description}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

const TONS = {
  neutral: "text-white",
  positive: "text-emerald-400",
  negative: "text-red-400",
  warning: "text-amber-400",
} as const;

export type Tom = keyof typeof TONS;

export function StatCard({
  label,
  value,
  tone = "neutral",
  hint,
  href,
}: {
  label: string;
  value: ReactNode;
  tone?: Tom;
  hint?: ReactNode;
  href?: string;
}) {
  const conteudo = (
    <>
      <p className="text-xs text-neutral-500">{label}</p>
      <p className={`mt-1 truncate text-lg font-semibold tabular-nums ${TONS[tone]}`}>{value}</p>
      {hint && <p className="mt-0.5 truncate text-xs text-neutral-500">{hint}</p>}
    </>
  );
  const classe = "block rounded-xl border border-neutral-800 bg-neutral-900 p-4";
  return href ? (
    <Link href={href} className={`${classe} transition hover:border-neutral-700`}>
      {conteudo}
    </Link>
  ) : (
    <div className={classe}>{conteudo}</div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-neutral-800 px-6 py-12 text-center">
      <p className="text-sm font-medium text-neutral-300">{title}</p>
      {description && <p className="max-w-sm text-sm text-neutral-500">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

const BADGES = {
  neutral: "bg-neutral-800 text-neutral-300",
  positive: "bg-emerald-500/10 text-emerald-400",
  negative: "bg-red-500/10 text-red-400",
  warning: "bg-amber-500/10 text-amber-400",
  info: "bg-sky-500/10 text-sky-400",
} as const;

export function Badge({ tone = "neutral", children }: { tone?: keyof typeof BADGES; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${BADGES[tone]}`}>
      {children}
    </span>
  );
}

export function Field({
  label,
  hint,
  children,
  className = "",
}: {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  // <label> envolvendo o controle associa o rótulo sem precisar de ids
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-medium text-neutral-400">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-neutral-500">{hint}</span>}
    </label>
  );
}

export function ErrorMessage({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
      {children}
    </div>
  );
}

// Tabela que vira rolagem horizontal no celular em vez de estourar a página
export function Table({ children, compacta = false }: { children: ReactNode; compacta?: boolean }) {
  // compacta: a tabela esconde colunas secundárias no celular (hidden sm:table-cell)
  // e por isso não precisa de largura mínima
  return (
    <div className="relative overflow-x-auto rounded-xl border border-neutral-800">
      <table className={`w-full text-sm ${compacta ? "" : "min-w-[560px]"}`}>{children}</table>
    </div>
  );
}

export const thClass = "px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-neutral-500";
export const theadClass = "bg-neutral-900";
export const tbodyClass = "divide-y divide-neutral-800";
export const tdClass = "px-4 py-3";
