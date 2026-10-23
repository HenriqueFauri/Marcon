import type { ReactNode } from "react";
import { Numero } from "./numero";
import { Variacao } from "./variacao";

// Cartão de destaque: número grande, a variação contra o período anterior e o valor de antes.
export function Kpi({
  rotulo,
  valor,
  numero,
  tom = "text-ink",
  atual,
  anterior,
  subirEhBom = true,
  pontos = false,
  antes,
  destaque = false,
  className = "",
}: {
  rotulo: string;
  valor: ReactNode;
  numero?: { v: number; tipo: "brl" | "pct" | "int" }; // anima de zero até o valor
  tom?: string;
  atual: number;
  anterior: number;
  subirEhBom?: boolean;
  pontos?: boolean;
  antes: string; // "Antes: R$ 1.200,00"
  destaque?: boolean;
  className?: string;
}) {
  return (
    <div className={`hairline rounded-3xl bg-surface p-4 sm:p-5 ${className}`}>
      <p className="text-[13px] font-medium text-ink-muted">{rotulo}</p>
      <p className={`mt-1 break-words font-bold tracking-tight tabular-nums ${destaque ? "text-[32px] leading-tight" : "text-[22px]"} ${tom}`}>{numero ? <Numero valor={numero.v} tipo={numero.tipo} /> : valor}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        <Variacao atual={atual} anterior={anterior} subirEhBom={subirEhBom} pontos={pontos} />
        <span className="truncate text-[13px] text-ink-muted">{antes}</span>
      </div>
    </div>
  );
}
