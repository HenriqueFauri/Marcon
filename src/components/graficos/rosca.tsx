import type { ReactNode } from "react";
import { formatPercentual } from "./formato";

// Cores por ordem fixa (tokens --graf-N, validados para daltonismo nos temas claro e escuro).
// Letras inteiras nas classes para o Tailwind enxergar.
const CORES = [
  { fundo: "bg-graf-1", traco: "stroke-graf-1" },
  { fundo: "bg-graf-2", traco: "stroke-graf-2" },
  { fundo: "bg-graf-3", traco: "stroke-graf-3" },
  { fundo: "bg-graf-4", traco: "stroke-graf-4" },
  { fundo: "bg-graf-5", traco: "stroke-graf-5" },
];
const OUTROS = { fundo: "bg-graf-outros", traco: "stroke-graf-outros" };

export interface Fatia {
  nome: string;
  valor: number;
  detalhe?: ReactNode; // ao lado do valor, na legenda (ex.: variação contra o mês anterior)
}

// mais de 5 categorias: as menores viram "Outros", nunca uma sexta cor inventada
export function dobrarEmOutros(fatias: Fatia[], max = 5): Fatia[] {
  const ordenadas = [...fatias].filter((f) => f.valor > 0).sort((a, b) => b.valor - a.valor);
  if (ordenadas.length <= max) return ordenadas;
  const resto = ordenadas.slice(max - 1);
  const mantidas = ordenadas.slice(0, max - 1);
  const valorResto = resto.reduce((s, f) => s + f.valor, 0);
  // uma categoria que já se chama "Outros" entra no mesmo balde
  const jaTem = mantidas.findIndex((f) => f.nome === "Outros");
  if (jaTem >= 0) {
    const sem = mantidas.filter((_, i) => i !== jaTem);
    return [...sem, { nome: "Outros", valor: valorResto + mantidas[jaTem].valor }];
  }
  return [...mantidas, { nome: "Outros", valor: valorResto }];
}

function corDe(fatias: Fatia[], i: number) {
  return fatias[i].nome === "Outros" && i === fatias.length - 1 && fatias.length > 1 ? OUTROS : CORES[i % CORES.length];
}

const R = 42;
const C = 2 * Math.PI * R;

export function Legenda({ fatias, formatar }: { fatias: Fatia[]; formatar: (v: number) => string }) {
  const total = fatias.reduce((s, f) => s + f.valor, 0);
  return (
    <ul className="min-w-0 flex-1 divide-y divide-line">
      {fatias.map((f, i) => (
        <li key={f.nome} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
          <span aria-hidden="true" className={`h-3 w-3 shrink-0 rounded-[4px] ${corDe(fatias, i).fundo}`} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] text-ink">{f.nome}</span>
            {f.detalhe && <span className="block text-[13px] text-ink-muted">{f.detalhe}</span>}
          </span>
          <span className="shrink-0 text-right">
            <span className="block text-[15px] font-semibold tabular-nums text-ink">{formatar(f.valor)}</span>
            <span className="block text-[13px] tabular-nums text-ink-muted">{formatPercentual(total > 0 ? (f.valor / total) * 100 : 0)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function Rosca({
  fatias,
  formatar,
  centroRotulo,
  centroValor,
  descricao,
}: {
  fatias: Fatia[];
  formatar: (v: number) => string;
  centroRotulo: string;
  centroValor: string;
  descricao: string;
}) {
  const total = fatias.reduce((s, f) => s + f.valor, 0);
  const inicios = fatias.map((_, i) => fatias.slice(0, i).reduce((s, f) => s + (total > 0 ? (f.valor / total) * C : 0), 0));
  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:gap-8">
      <div className="graf-girar relative h-40 w-40 shrink-0">
        <svg viewBox="0 0 100 100" className="graf-fade h-full w-full -rotate-90" role="img" aria-label={descricao}>
          <circle cx="50" cy="50" r={R} fill="none" strokeWidth="13" className="stroke-fill" />
          {fatias.map((f, i) => {
            const parte = total > 0 ? (f.valor / total) * C : 0;
            const folga = fatias.length > 1 ? 1.6 : 0; // fio entre as fatias, na cor do cartão
            return (
              <circle
                key={f.nome}
                cx="50"
                cy="50"
                r={R}
                fill="none"
                strokeWidth="13"
                className={corDe(fatias, i).traco}
                strokeDasharray={`${Math.max(parte - folga, 0.01)} ${C}`}
                strokeDashoffset={-inicios[i]}
              >
                <title>{`${f.nome}: ${formatar(f.valor)} (${formatPercentual(total > 0 ? (f.valor / total) * 100 : 0)})`}</title>
              </circle>
            );
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
          <span className="text-[12px] text-ink-muted">{centroRotulo}</span>
          <span className="max-w-full break-words text-[15px] font-bold tabular-nums leading-tight text-ink">{centroValor}</span>
        </div>
      </div>
      <div className="w-full min-w-0 flex-1">
        <Legenda fatias={fatias} formatar={formatar} />
      </div>
    </div>
  );
}

// Uma barra só dividida em partes (forma de pagamento): lê-se o todo e a fatia de cada um
export function BarraEmpilhada({ fatias, formatar }: { fatias: Fatia[]; formatar: (v: number) => string }) {
  const total = fatias.reduce((s, f) => s + f.valor, 0);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex h-4 w-full gap-0.5 overflow-hidden rounded-full" role="img" aria-label={fatias.map((f) => `${f.nome} ${formatPercentual(total > 0 ? (f.valor / total) * 100 : 0)}`).join(", ")}>
        {fatias.map((f, i) => (
          <div
            key={f.nome}
            title={`${f.nome}: ${formatar(f.valor)}`}
            className={`graf-barra-h h-full ${corDe(fatias, i).fundo}`}
            style={{ width: `${total > 0 ? (f.valor / total) * 100 : 0}%`, minWidth: 4 }}
          />
        ))}
      </div>
      <Legenda fatias={fatias} formatar={formatar} />
    </div>
  );
}
