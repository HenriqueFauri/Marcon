import { formatBRL } from "@/lib/format";

// Lucro, margem e markup de uma unidade, ao vivo enquanto se digita custo e preço.
export function Margem({ custo, preco, className = "" }: { custo: number | null; preco: number | null; className?: string }) {
  if (custo === null || preco === null) return null;
  const lucro = preco - custo;
  const margem = preco > 0 ? (lucro / preco) * 100 : null;
  const markup = custo > 0 ? (lucro / custo) * 100 : null;
  return (
    <p className={`text-sm ${lucro >= 0 ? "text-ink-muted" : "text-danger"} ${className}`}>
      Lucro de <strong className={lucro >= 0 ? "text-positive" : "text-danger"}>{formatBRL(lucro)}</strong> por unidade
      {margem !== null && ` · margem de ${margem.toFixed(1)}%`}
      {markup !== null && ` · markup de ${markup.toFixed(0)}%`}
    </p>
  );
}
