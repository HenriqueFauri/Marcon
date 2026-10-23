import { formatPct, variacao } from "@/lib/relatorios";

// Seta + porcentagem contra o período anterior. A cor diz se foi bom ou ruim (subir gasto é ruim);
// a seta e o texto dizem o sentido, então nada depende só da cor.
export function Variacao({
  atual,
  anterior,
  subirEhBom = true,
  pontos = false,
  className = "",
}: {
  atual: number;
  anterior: number;
  subirEhBom?: boolean;
  // margem compara em pontos percentuais, não em %
  pontos?: boolean;
  className?: string;
}) {
  const base = `inline-flex items-center gap-0.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${className}`;
  const v = pontos ? atual - anterior : variacao(atual, anterior);
  if (v === null) {
    return <span className={`${base} bg-fill text-ink-muted`}>{atual > 0 ? "novo" : "sem base"}</span>;
  }
  if (Math.abs(v) < 0.05) return <span className={`${base} bg-fill text-ink-muted`}>= igual</span>;
  const subiu = v > 0;
  const bom = subiu === subirEhBom;
  const texto = pontos ? `${Math.abs(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} pp` : formatPct(Math.abs(v));
  return (
    <span className={`${base} ${bom ? "bg-positive-tint text-positive" : "bg-danger-tint text-danger"}`} aria-label={`${subiu ? "Subiu" : "Caiu"} ${texto} em relação ao período anterior`}>
      <svg viewBox="0 0 12 12" width={10} height={10} fill="currentColor" aria-hidden="true">
        {subiu ? <path d="M6 2 10.5 9h-9z" /> : <path d="M6 10 1.5 3h9z" />}
      </svg>
      {texto}
    </span>
  );
}
