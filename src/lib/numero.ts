// Lê o que a pessoa digitou num campo de valor: "12,50", "12.50" e "1.234,50".
// Vazio ou texto que não é número volta null.
export function lerNumero(texto: string): number | null {
  const t = texto.trim();
  if (!t) return null;
  const limpo = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}
