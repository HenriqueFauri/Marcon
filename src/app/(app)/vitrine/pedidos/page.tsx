import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { Segmentos } from "@/components/ui";
import type { PedidoRecebido } from "@/lib/vitrine";
import { Grupo } from "../campos";
import { LinhaDoPedido } from "./linha-do-pedido";

export const metadata: Metadata = { title: "Vitrine | Pedidos" };

const FILTROS = [
  { valor: "novo", label: "Novos" },
  { valor: "vendido", label: "Vendidos" },
  { valor: "descartado", label: "Descartados" },
  { valor: "todos", label: "Todos" },
] as const;

const VAZIO: Record<(typeof FILTROS)[number]["valor"], string> = {
  novo: "Nenhum pedido novo. Quando um cliente tocar em Enviar pedido na sua loja, ele aparece aqui.",
  vendido: "Nenhum pedido virou venda ainda.",
  descartado: "Nenhum pedido descartado.",
  todos: "A loja ainda não recebeu pedidos.",
};

// Pedidos montados na loja. O cliente pode desistir no WhatsApp, então pedido aqui não quer dizer
// pedido enviado: o código (#K7P2Q) na mensagem do Zap ajuda a conferir.
export default async function VitrinePedidosPage({ searchParams }: PageProps<"/vitrine/pedidos">) {
  const { status: bruto } = await searchParams;
  const filtro = FILTROS.find((f) => f.valor === bruto)?.valor ?? "novo";
  const supabase = await createClient();
  let consulta = supabase.from("vitrine_pedidos").select("*").order("created_at", { ascending: false }).limit(100);
  if (filtro !== "todos") consulta = consulta.eq("status", filtro);
  const { data } = await consulta;
  const pedidos = (data ?? []) as PedidoRecebido[];

  return (
    <div className="flex flex-col gap-4">
      <Segmentos
        rotulo="Filtrar pedidos"
        itens={FILTROS.map((f) => ({ href: `/vitrine/pedidos?status=${f.valor}`, label: f.label, ativo: f.valor === filtro }))}
      />
      <Grupo semPadding rodape="O pedido é gravado quando o cliente toca em Enviar pedido. Ele pode desistir no WhatsApp: confira pelo código.">
        {pedidos.length === 0 ? (
          <p className="px-4 py-6 text-center text-[15px] text-ink-muted">{VAZIO[filtro]}</p>
        ) : (
          pedidos.map((p) => <LinhaDoPedido key={p.id} pedido={p} />)
        )}
      </Grupo>
    </div>
  );
}
