// Leitura de dinheiro, datas e faixas como aparecem nos relatórios.

// "R$ 1.234,56", "-R$ 105,37", "R$ -5,00"
export function lerDinheiro(texto: string): number | null {
  const m = texto.match(/(-)?\s*R\$\s*(-)?\s*(\d{1,3}(?:\.\d{3})+|\d+),(\d{2})/);
  if (!m) return null;
  const valor = Number(`${m[3].replace(/\./g, "")}.${m[4]}`);
  return m[1] || m[2] ? -valor : valor;
}

// "22/09/2026" -> "2026-09-22"; recusa data que não existe
export function lerData(texto: string): string | null {
  const m = texto.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  const [, d, mes, a] = m;
  const data = new Date(Date.UTC(Number(a), Number(mes) - 1, Number(d)));
  if (data.getUTCFullYear() !== Number(a) || data.getUTCMonth() !== Number(mes) - 1 || data.getUTCDate() !== Number(d)) {
    return null;
  }
  return `${a}-${mes}-${d}`;
}

// produto com variações mostra o custo/preço como faixa: "70.28–75.42" (ponto decimal)
export function lerFaixa(texto: string): [number, number] | null {
  const m = texto.match(/(\d+(?:\.\d+)?)\s*[–-]\s*(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  return Number.isFinite(a) && Number.isFinite(b) ? [Math.min(a, b), Math.max(a, b)] : null;
}

export function arredondar(valor: number) {
  return Math.round(valor * 100) / 100;
}

export function brl(valor: number) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
