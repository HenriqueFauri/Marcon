import type { ReactNode } from "react";

// Linha de ranking: foto (opcional), nome, barra proporcional ao maior da lista e valor.
// A barra é de uma cor só (a da marca): o tamanho já conta a história, a cor não precisa.
const TONS = {
  marca: "bg-graf-1",
  azul: "bg-graf-2",
  verde: "bg-graf-3",
  alerta: "bg-warning",
  perigo: "bg-danger",
} as const;

export type TomBarra = keyof typeof TONS;

export function LinhaBarra({
  inicio,
  nome,
  detalhe,
  valor,
  fracao,
  tom = "marca",
  valorTom = "text-ink",
}: {
  inicio?: ReactNode; // foto de capa ou ícone
  nome: ReactNode;
  detalhe?: ReactNode;
  valor: ReactNode;
  fracao: number; // 0 a 1
  tom?: TomBarra;
  valorTom?: string;
}) {
  const largura = Math.max(0, Math.min(1, fracao)) * 100;
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      {inicio}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <p className="min-w-0 truncate text-[15px] text-ink">{nome}</p>
          <p className={`shrink-0 text-[15px] font-semibold tabular-nums ${valorTom}`}>{valor}</p>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-fill" aria-hidden="true">
          <div className={`graf-barra-h h-full rounded-full ${TONS[tom]}`} style={{ width: `${largura}%`, minWidth: largura > 0 ? 4 : 0 }} />
        </div>
        {detalhe && <p className="mt-1 truncate text-[13px] text-ink-muted">{detalhe}</p>}
      </div>
    </li>
  );
}
