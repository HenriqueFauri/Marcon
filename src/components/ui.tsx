import Link from "next/link";
import type { ReactNode } from "react";

// Classes compartilhadas: mantêm o visual consistente entre telas sem precisar
// de uma biblioteca de componentes.
export const inputClass =
  "w-full rounded-xl border border-transparent bg-fill px-3.5 py-2.5 text-[15px] text-ink outline-none transition placeholder:text-ink-muted focus:border-brand focus:bg-surface focus:ring-4 focus:ring-brand/15 disabled:cursor-not-allowed disabled:opacity-50";

// Botões em pílula, como no iOS: o principal é a terracota com texto escuro
// (creme por cima da terracota não passa em contraste).
const btnBase =
  "inline-flex items-center justify-center gap-1.5 rounded-full text-[15px] font-semibold transition outline-none focus-visible:ring-4 focus-visible:ring-brand/40 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100";

export const btnPrimary = `${btnBase} bg-brand-fill px-5 py-2.5 text-on-brand shadow-sm shadow-brand/30`;
export const btnSecondary = `${btnBase} bg-fill px-5 py-2.5 text-ink hover:bg-fill-strong`;
export const btnGhost = `${btnBase} px-4 py-2.5 font-medium text-ink-2 hover:bg-fill hover:text-ink`;
export const btnDanger = `${btnBase} bg-danger px-5 py-2.5 text-on-danger hover:bg-danger/90`;
export const btnIcon =
  "inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-muted transition hover:bg-fill hover:text-ink disabled:opacity-50";
export const btnIconDanger =
  "inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-muted transition hover:bg-danger-tint hover:text-danger disabled:opacity-50";

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
        <Link
          href={back.href}
          className="-ml-1 mb-1 inline-flex max-w-full items-center gap-0.5 text-[15px] font-medium text-brand-text hover:opacity-80"
        >
          <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m15 18-6-6 6-6" />
          </svg>
          <span className="truncate">{back.label}</span>
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[28px] font-bold leading-tight tracking-tight text-ink">{title}</h1>
          {description && <p className="mt-1 text-[15px] text-ink-muted">{description}</p>}
        </div>
        {action && <div className="flex min-w-0 max-w-full flex-wrap gap-2">{action}</div>}
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
    <section className={`hairline rounded-3xl bg-surface p-5 sm:p-6 ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            {title && <h2 className="text-[17px] font-semibold tracking-tight text-ink">{title}</h2>}
            {description && <p className="mt-0.5 text-[13px] text-ink-muted">{description}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

const TONS = {
  neutral: "text-ink",
  positive: "text-positive",
  negative: "text-danger",
  warning: "text-warning",
} as const;

export type Tom = keyof typeof TONS;

export function StatCard({
  label,
  value,
  tone = "neutral",
  hint,
  href,
  className = "",
}: {
  label: string;
  value: ReactNode;
  tone?: Tom;
  hint?: ReactNode;
  href?: string;
  className?: string;
}) {
  const conteudo = (
    <>
      <p className="text-[13px] font-medium text-ink-muted">{label}</p>
      <p className={`mt-1 truncate text-[22px] font-bold tracking-tight tabular-nums ${TONS[tone]}`}>{value}</p>
      {hint && <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-ink-muted">{hint}</p>}
    </>
  );
  const classe = `hairline block rounded-3xl bg-surface p-4 sm:p-5 ${className}`;
  return href ? (
    <Link href={href} className={`${classe} transition hover:bg-surface/70 active:scale-[0.99]`}>
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
    <div className="hairline flex flex-col items-center gap-2 rounded-3xl bg-surface px-6 py-14 text-center">
      <p className="text-[17px] font-semibold text-ink">{title}</p>
      {description && <p className="max-w-sm text-[15px] text-ink-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

const BADGES = {
  neutral: "bg-fill text-ink-2",
  positive: "bg-positive-tint text-positive",
  negative: "bg-danger-tint text-danger",
  warning: "bg-warning-tint text-warning",
  info: "bg-info-tint text-info",
} as const;

export function Badge({ tone = "neutral", children }: { tone?: keyof typeof BADGES; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${BADGES[tone]}`}>
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
    <label className={`block min-w-0 ${className}`}>
      <span className="mb-1.5 block text-[13px] font-medium text-ink-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-muted">{hint}</span>}
    </label>
  );
}

export function ErrorMessage({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="rounded-2xl border border-danger/30 bg-danger-tint px-4 py-3 text-sm text-danger">
      {children}
    </div>
  );
}

// Tabela que vira rolagem horizontal no celular em vez de estourar a página
export function Table({ children, compacta = false }: { children: ReactNode; compacta?: boolean }) {
  // compacta: a tabela esconde colunas secundárias no celular (hidden sm:table-cell)
  // e por isso não precisa de largura mínima
  return (
    <div className="hairline relative overflow-x-auto rounded-3xl bg-surface">
      <table className={`w-full text-sm ${compacta ? "" : "min-w-[560px]"}`}>{children}</table>
    </div>
  );
}

export const thClass = "px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-ink-muted";
export const theadClass = "border-b border-line";
export const tbodyClass = "divide-y divide-line";
export const tdClass = "px-4 py-3.5";

// Controle segmentado do iOS feito de links (filtros que mudam a URL). As opções dividem a
// largura, então nada rola de lado nem corta no celular.
export function Segmentos({
  itens,
  rotulo,
  className = "",
  substituir = true,
}: {
  itens: { href: string; label: ReactNode; ativo: boolean }[];
  rotulo: string;
  className?: string;
  // filtros trocam a URL sem empilhar histórico; abas de seção empilham (o Voltar volta para a aba anterior)
  substituir?: boolean;
}) {
  return (
    <nav
      aria-label={rotulo}
      className={`grid gap-0.5 rounded-full bg-fill p-[3px] ${className}`}
      style={{ gridTemplateColumns: `repeat(${itens.length}, minmax(0, 1fr))` }}
    >
      {itens.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          replace={substituir}
          aria-current={i.ativo ? "page" : undefined}
          className={`flex min-w-0 items-center justify-center gap-1 rounded-full px-2 py-2 text-[13px] transition ${
            i.ativo ? "bg-surface font-semibold text-ink shadow-sm" : "font-medium text-ink-2 hover:text-ink"
          }`}
        >
          <span className="truncate">{i.label}</span>
        </Link>
      ))}
    </nav>
  );
}
