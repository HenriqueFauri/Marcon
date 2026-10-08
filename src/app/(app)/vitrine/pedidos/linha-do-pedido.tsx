import Link from "next/link";
import { formatBRL } from "@/lib/format";
import { quantidadeDeItens, type PedidoRecebido } from "@/lib/vitrine";

// "agora", "há 5 min", "há 3 h", "ontem", "12/10"
export function quandoFoi(iso: string, agora = Date.now()) {
  const min = Math.floor((agora - new Date(iso).getTime()) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  if (min < 24 * 60) return `há ${Math.floor(min / 60)} h`;
  if (min < 48 * 60) return "ontem";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date(iso));
}

const STATUS: Record<PedidoRecebido["status"], string | null> = { novo: null, vendido: "Virou venda", descartado: "Descartado" };

// linha de lista no padrão do app: nome em 17px, detalhe em 13px, valor à direita e ›
export function LinhaDoPedido({ pedido: p }: { pedido: PedidoRecebido }) {
  const n = quantidadeDeItens(p);
  const detalhe = [
    `${n} ${n === 1 ? "item" : "itens"}`,
    p.entrega === "entrega" ? "Entrega" : "Retirada",
    quandoFoi(p.created_at),
    STATUS[p.status],
  ].filter(Boolean);
  return (
    <Link
      href={`/vitrine/pedidos/${p.id}`}
      className="flex items-center gap-3 border-t border-line px-4 py-3 transition first:border-t-0 hover:bg-fill/60 active:bg-fill"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[17px] text-ink">
          {p.cliente_nome || "Cliente sem nome"} <span className="text-ink-muted">#{p.codigo}</span>
        </span>
        <span className="block truncate text-[13px] text-ink-muted">{detalhe.join(" · ")}</span>
      </span>
      <span className={`shrink-0 text-[15px] tabular-nums ${p.status === "novo" ? "font-semibold text-ink" : "text-ink-muted"}`}>
        {formatBRL(p.total)}
      </span>
      <span aria-hidden="true" className="text-lg text-ink-faint">
        ›
      </span>
    </Link>
  );
}
