import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatBRL } from "@/lib/format";
import { btnPrimary, btnSecondary } from "@/components/ui";
import type { PedidoRecebido } from "@/lib/vitrine";
import { Grupo } from "../../campos";
import { quandoFoi } from "../linha-do-pedido";
import { AcaoDeStatus } from "./acoes-do-pedido";

export const metadata: Metadata = { title: "Vitrine | Pedido" };

function Linha({ rotulo, valor, forte = false }: { rotulo: string; valor: string; forte?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className={forte ? "text-[17px] text-ink" : "text-[15px] text-ink-muted"}>{rotulo}</span>
      <span className={`tabular-nums ${forte ? "text-[17px] font-semibold text-ink" : "text-[15px] text-ink-2"}`}>{valor}</span>
    </div>
  );
}

export default async function PedidoPage({ params }: PageProps<"/vitrine/pedidos/[id]">) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("vitrine_pedidos").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const p = data as PedidoRecebido;
  const quando = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(p.created_at));

  return (
    <div className="flex flex-col gap-7">
      <Grupo>
        <div>
          <p className="text-[22px] font-bold tracking-tight text-ink">Pedido #{p.codigo}</p>
          <p className="text-[13px] text-ink-muted">
            {quando} ({quandoFoi(p.created_at)})
            {p.status === "vendido" ? " · Virou venda" : p.status === "descartado" ? " · Descartado" : ""}
          </p>
        </div>
        {p.status === "novo" && (
          <Link href={`/vendas/novo?pedido=${p.id}`} className={`${btnPrimary} w-full py-3 sm:w-auto sm:self-start`}>
            Registrar venda
          </Link>
        )}
        {p.status === "vendido" && p.venda_id && (
          <Link href={`/vendas/${p.venda_id}`} className={`${btnSecondary} w-full py-3 sm:w-auto sm:self-start`}>
            Ver a venda
          </Link>
        )}
      </Grupo>

      <Grupo titulo="Cliente">
        <Linha rotulo="Nome" valor={p.cliente_nome || "Não informou"} />
        <Linha rotulo="Recebe por" valor={p.entrega === "entrega" ? "Entrega" : "Retirada no local"} />
        {p.entrega === "entrega" && (
          <div>
            <p className="text-[15px] text-ink-muted">Endereço</p>
            <p className="mt-0.5 whitespace-pre-line text-[15px] text-ink-2">{p.endereco || "Não informou"}</p>
          </div>
        )}
        <Linha rotulo="Pagamento" valor={p.pagamento || "Não escolheu"} />
      </Grupo>

      <Grupo titulo="Itens" semPadding rodape={p.frete ? "O frete não entra na venda do app: ele fica só no total do cliente." : undefined}>
        {p.itens.map((i, n) => (
          <div key={n} className="flex items-center gap-3 border-t border-line px-4 py-3 first:border-t-0">
            <span className="min-w-0 flex-1">
              <span className="block text-[17px] text-ink">{i.nome}</span>
              <span className="block text-[13px] text-ink-muted">
                {[i.variacao, `${i.quantidade} x ${formatBRL(Number(i.preco))}`].filter(Boolean).join(" · ")}
              </span>
            </span>
            <span className="shrink-0 text-[15px] tabular-nums text-ink">{formatBRL(Number(i.preco) * Number(i.quantidade))}</span>
          </div>
        ))}
        <div className="flex flex-col gap-1.5 border-t border-line px-4 py-3">
          <Linha rotulo="Produtos" valor={formatBRL(p.subtotal)} />
          {Number(p.desconto) > 0 && <Linha rotulo={`Cupom ${p.cupom ?? ""}`.trim()} valor={`−${formatBRL(p.desconto)}`} />}
          {p.entrega === "entrega" && <Linha rotulo="Frete" valor={p.frete ? formatBRL(p.frete) : "A combinar"} />}
          <Linha rotulo="Total" valor={formatBRL(p.total)} forte />
        </div>
      </Grupo>

      {p.status !== "vendido" && <AcaoDeStatus id={p.id} status={p.status} />}
    </div>
  );
}
