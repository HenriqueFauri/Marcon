import type { ProdutoComEstoque } from "@/types/domain";

export function situacaoEstoque(p: Pick<ProdutoComEstoque, "estoque_total" | "alerta_estoque_baixo">) {
  if (p.estoque_total <= 0) return "sem" as const;
  if (p.alerta_estoque_baixo != null && p.estoque_total <= p.alerta_estoque_baixo) return "baixo" as const;
  return "ok" as const;
}
