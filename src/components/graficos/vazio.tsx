import type { ReactNode } from "react";

// Estado vazio dos relatórios: um gráfico fantasma em vez de tela em branco, com o próximo passo.
export function EstadoVazio({ titulo, texto, acoes }: { titulo: string; texto: string; acoes?: ReactNode }) {
  return (
    <div className="hairline flex flex-col items-center gap-3 rounded-3xl bg-surface px-6 py-12 text-center">
      <svg viewBox="0 0 120 64" width={120} height={64} aria-hidden="true" className="text-fill-strong">
        <rect x="6" y="38" width="14" height="22" rx="4" fill="currentColor" />
        <rect x="28" y="26" width="14" height="34" rx="4" fill="currentColor" />
        <rect x="50" y="42" width="14" height="18" rx="4" fill="currentColor" />
        <rect x="72" y="14" width="14" height="46" rx="4" fill="currentColor" />
        <rect x="94" y="30" width="14" height="30" rx="4" fill="currentColor" />
        <path d="M4 62h112" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <p className="text-[19px] font-semibold tracking-tight text-ink">{titulo}</p>
      <p className="max-w-xs text-[15px] text-ink-muted">{texto}</p>
      {acoes && <div className="mt-2 flex w-full max-w-xs flex-col gap-2 sm:w-auto sm:max-w-none sm:flex-row">{acoes}</div>}
    </div>
  );
}
