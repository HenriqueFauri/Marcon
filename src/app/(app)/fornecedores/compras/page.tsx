import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatBRL, formatData } from "@/lib/format";
import { Grupo } from "@/components/ajustes";
import { EmptyState, ErrorMessage, PageHeader, btnPrimary } from "@/components/ui";
import { IconPlus } from "@/components/icons";

export const metadata: Metadata = { title: "Compras" };

interface Item {
  produto_nome: string;
  quantidade: number;
  valor_unitario: number;
  frete_rateado: number;
  custo_unitario_final: number;
}

interface Pedido {
  id: string;
  fornecedor_nome: string | null;
  data: string;
  frete: number;
  total_itens: number;
  observacoes: string | null;
  a_prazo: boolean | null;
  parcelas: number | null;
  pedido_compra_itens: Item[];
}

export default async function ComprasPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pedidos_compra")
    .select(
      "id, fornecedor_nome, data, frete, total_itens, observacoes, a_prazo, parcelas, pedido_compra_itens(produto_nome, quantidade, valor_unitario, frete_rateado, custo_unitario_final)",
    )
    .order("data", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);

  const nova = (
    <Link href="/fornecedores/compras/nova" className={btnPrimary}>
      <IconPlus width={16} height={16} /> Nova compra
    </Link>
  );
  const voltar = { href: "/fornecedores", label: "Fornecedores" };

  if (error) {
    return (
      <div>
        <PageHeader title="Compras" back={voltar} action={nova} />
        <ErrorMessage>Não foi possível carregar as compras: {error.message}</ErrorMessage>
      </div>
    );
  }

  const pedidos = (data ?? []) as unknown as Pedido[];

  return (
    <div className="flex flex-col gap-7">
      <PageHeader title="Compras" back={voltar} action={nova} />

      {pedidos.length === 0 ? (
        <EmptyState
          title="Nenhuma compra ainda"
          description="O frete entra no custo de cada produto."
          action={nova}
        />
      ) : (
        pedidos.map((p) => (
          <Grupo
            key={p.id}
            titulo={`${formatData(p.data)}${p.fornecedor_nome ? ` · ${p.fornecedor_nome}` : ""}`}
            semPadding
            rodape={p.observacoes ?? undefined}
          >
            <ul className="divide-y divide-line">
              {p.pedido_compra_itens.map((i, idx) => (
                <li key={idx} className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-[17px] text-ink">{i.produto_nome}</p>
                    <p className="text-[13px] text-ink-muted">
                      {i.quantidade} × {formatBRL(i.valor_unitario)}
                      {Number(i.frete_rateado) > 0 ? ` + frete = ${formatBRL(i.custo_unitario_final)} cada` : ""}
                    </p>
                  </div>
                  <span className="shrink-0 text-[17px] tabular-nums text-ink">
                    {formatBRL(i.quantidade * Number(i.valor_unitario) + Number(i.frete_rateado))}
                  </span>
                </li>
              ))}
              <li className="flex items-center justify-between gap-3 px-4 py-3 text-[15px]">
                <span className="text-ink-muted">
                  Itens {formatBRL(p.total_itens)} + frete {formatBRL(p.frete)}
                </span>
                <span className="font-semibold tabular-nums text-ink">{formatBRL(Number(p.total_itens) + Number(p.frete))}</span>
              </li>
              {p.a_prazo && (
                <li className="px-4 py-3 text-[15px] text-ink-muted">
                  A prazo · {p.parcelas === 1 || !p.parcelas ? "1 parcela" : `${p.parcelas} parcelas`}
                </li>
              )}
            </ul>
          </Grupo>
        ))
      )}
    </div>
  );
}
