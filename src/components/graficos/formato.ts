// Números curtos para eixos e rótulos de gráfico (R$ 1,2 mil), sempre em português.
export function formatCompacto(valor: number) {
  const a = Math.abs(valor);
  if (a >= 1_000_000) return `${(valor / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (a >= 1_000) return `${(valor / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: a >= 10_000 ? 0 : 1 })} mil`;
  return Math.round(valor).toLocaleString("pt-BR");
}

export function formatPercentual(valor: number) {
  return `${valor.toLocaleString("pt-BR", { maximumFractionDigits: valor > 0 && valor < 10 ? 1 : 0 })}%`;
}
