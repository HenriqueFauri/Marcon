import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Parcela, Venda, VendaItem } from "@/types/domain";
import { formatBRL, formatData } from "@/lib/format";
import { Badge, Card, PageHeader, StatCard, Table, tbodyClass, tdClass, thClass, theadClass } from "@/components/ui";
import { CancelarVendaButton } from "./cancelar-venda-button";
import { MarcarPagoButton } from "../../contas-a-receber/marcar-pago-button";

export const metadata: Metadata = { title: "Detalhe da venda" };

const STATUS_PARCELA = {
  pendente: { label: "Pendente", tone: "warning" },
  pago: { label: "Paga", tone: "positive" },
  atrasado: { label: "Atrasada", tone: "negative" },
} as const;

export default async function VendaDetalhePage({ params }: PageProps<"/vendas/[id]">) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: vendaData }, { data: itensData }, { data: parcelasData }] = await Promise.all([
    supabase.from("vendas").select("*").eq("id", id).maybeSingle(),
    supabase.from("venda_itens").select("*").eq("venda_id", id),
    supabase.from("parcelas_com_status").select("*").eq("venda_id", id).order("numero_parcela"),
  ]);

  if (!vendaData) notFound();

  const venda = vendaData as Venda;
  const itens = (itensData ?? []) as VendaItem[];
  const parcelas = (parcelasData ?? []) as Parcela[];
  const cancelada = venda.status === "cancelada";
  const lucro = Number(venda.valor_total) - Number(venda.custo_total);
  const subtotal = itens.reduce((s, i) => s + i.quantidade * Number(i.preco_unitario), 0);
  const recebido = parcelas.filter((p) => p.status_efetivo === "pago").reduce((s, p) => s + Number(p.valor), 0);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        back={{ href: "/vendas", label: "Vendas" }}
        title={
          <span className="flex flex-wrap items-center gap-2">
            Venda de {formatData(venda.data)}
            {cancelada && <Badge tone="negative">Cancelada</Badge>}
          </span>
        }
        description={venda.cliente_nome ? `Cliente: ${venda.cliente_nome}` : "Venda avulsa"}
        action={!cancelada && <CancelarVendaButton vendaId={venda.id} />}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="Total" value={formatBRL(venda.valor_total)} />
        <StatCard label="Custo" value={formatBRL(venda.custo_total)} tone="negative" />
        <StatCard
          label="Lucro"
          value={formatBRL(lucro)}
          tone={lucro >= 0 ? "positive" : "negative"}
          hint={
            Number(venda.valor_total) > 0
              ? `${((lucro / Number(venda.valor_total)) * 100).toFixed(1)}% de margem`
              : undefined
          }
        />
      </div>

      <Card title="Itens" className="mb-6">
        <ul className="divide-y divide-line">
          {itens.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="truncate text-ink">{item.produto_nome}</p>
                <p className="text-xs text-ink-muted">
                  {item.quantidade} × {formatBRL(item.preco_unitario)}
                </p>
              </div>
              <span className="shrink-0 tabular-nums text-ink">
                {formatBRL(item.quantidade * Number(item.preco_unitario))}
              </span>
            </li>
          ))}
        </ul>
        <dl className="mt-3 space-y-1 border-t border-line pt-3 text-sm">
          {Number(venda.desconto) > 0 && (
            <>
              <div className="flex justify-between text-ink-muted">
                <dt>Subtotal</dt>
                <dd className="tabular-nums">{formatBRL(subtotal)}</dd>
              </div>
              <div className="flex justify-between text-ink-muted">
                <dt>Desconto</dt>
                <dd className="tabular-nums">− {formatBRL(venda.desconto)}</dd>
              </div>
            </>
          )}
          <div className="flex justify-between font-semibold text-ink">
            <dt>Total</dt>
            <dd className="tabular-nums">{formatBRL(venda.valor_total)}</dd>
          </div>
        </dl>
      </Card>

      <Card title="Pagamento" className="mb-6">
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-ink-muted">Tipo</dt>
            <dd className="text-ink">{venda.tipo_pagamento === "a_prazo" ? "A prazo / parcelado" : "À vista"}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-muted">Forma</dt>
            <dd className="text-ink">{venda.forma_pagamento ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-muted">Canal</dt>
            <dd className="text-ink">{venda.canal ?? "—"}</dd>
          </div>
        </dl>
      </Card>

      {parcelas.length > 0 && (
        <Card
          title="Parcelas"
          description={`${formatBRL(recebido)} recebido de ${formatBRL(venda.valor_total)}`}
        >
          <Table>
            <thead className={theadClass}>
              <tr>
                <th className={thClass}>Parcela</th>
                <th className={thClass}>Vencimento</th>
                <th className={`${thClass} text-right`}>Valor</th>
                <th className={thClass}>Status</th>
                <th className={`${thClass} text-right`}>
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody className={tbodyClass}>
              {parcelas.map((p) => {
                const status = STATUS_PARCELA[p.status_efetivo];
                return (
                  <tr key={p.id}>
                    <td className={`${tdClass} text-ink-2`}>
                      {p.numero_parcela}/{parcelas.length}
                    </td>
                    <td className={`${tdClass} text-ink-2`}>
                      {formatData(p.vencimento)}
                      {p.data_pagamento && (
                        <span className="block text-xs text-ink-muted">paga em {formatData(p.data_pagamento)}</span>
                      )}
                    </td>
                    <td className={`${tdClass} text-right tabular-nums text-ink`}>{formatBRL(p.valor)}</td>
                    <td className={tdClass}>
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </td>
                    <td className={`${tdClass} text-right`}>
                      {p.status_efetivo !== "pago" && <MarcarPagoButton id={p.id} />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}
