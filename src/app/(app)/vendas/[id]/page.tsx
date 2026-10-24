import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Parcela, Venda, VendaItem } from "@/types/domain";
import { formatBRL, formatData } from "@/lib/format";
import { Badge, PageHeader, StatCard, Table, btnSecondary, btnSmallNeutro, tbodyClass, tdClass, thClass, theadClass } from "@/components/ui";
import { Grupo, LinhaInfo } from "@/components/ajustes";
import { CancelarVendaButton } from "./cancelar-venda-button";
import { DevolverItemButton } from "./devolver-item-button";
import { ReciboCard } from "./recibo-card";
import { ReceberButton } from "../../contas-a-receber/receber-button";
import { DesfazerRecebimento } from "../../contas-a-receber/desfazer-recebimento";

export const metadata: Metadata = { title: "Detalhe da venda" };

const STATUS_PARCELA = {
  pendente: { label: "Pendente", tone: "warning", texto: "text-warning" },
  pago: { label: "Paga", tone: "positive", texto: "text-positive" },
  atrasado: { label: "Atrasada", tone: "negative", texto: "text-danger" },
} as const;

export default async function VendaDetalhePage({ params }: PageProps<"/vendas/[id]">) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: vendaData }, { data: itensData }, { data: parcelasData }] = await Promise.all([
    supabase.from("vendas").select("*").eq("id", id).maybeSingle(),
    supabase.from("venda_itens").select("*").eq("venda_id", id),
    supabase.from("parcelas_com_status").select("*").eq("venda_id", id).order("numero_parcela").order("created_at"),
  ]);

  if (!vendaData) notFound();

  const venda = vendaData as Venda;
  const itens = (itensData ?? []) as VendaItem[];
  const parcelas = (parcelasData ?? []) as Parcela[];
  const cancelada = venda.status === "cancelada";
  const lucro = Number(venda.valor_total) - Number(venda.custo_total);
  const outrosGastos = Number(venda.outros_gastos ?? 0);
  const unidadesNaVenda = itens.reduce((s, i) => s + i.quantidade, 0);
  const subtotal = itens.reduce((s, i) => s + i.quantidade * Number(i.preco_unitario), 0);
  const [{ data: cliente }, { data: { user } }] = await Promise.all([
    venda.cliente_id
      ? supabase.from("clientes").select("telefone").eq("id", venda.cliente_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.auth.getUser(),
  ]);
  const nomeNegocio = (user?.user_metadata?.nome_negocio as string | undefined) || null;
  // uma parcela recebida em partes ocupa mais de uma linha: o total é o maior número
  const totalParcelas = parcelas.reduce((m, p) => Math.max(m, p.numero_parcela), 0);
  const recebido = parcelas.filter((p) => p.status_efetivo === "pago").reduce((s, p) => s + Number(p.valor), 0);
  const resumoParcelas = `${formatBRL(recebido)} recebido de ${formatBRL(venda.valor_total)}.`;
  const janelaRecebimento = (p: Parcela, trigger: ReactNode, triggerClassName: string, triggerLabel?: string) => (
    <DesfazerRecebimento
      id={p.id}
      valor={Number(p.valor)}
      numero={p.numero_parcela}
      cliente={venda.cliente_nome}
      dataPagamento={p.data_pagamento}
      vencimento={p.vencimento}
      parcial={p.parcial}
      entrada={p.entrada}
      cancelada={cancelada}
      trigger={trigger}
      triggerClassName={triggerClassName}
      triggerLabel={triggerLabel}
    />
  );

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
        action={
          <Link href={`/vendas/novo?repetir=${venda.id}`} className={btnSecondary}>
            Duplicar
          </Link>
        }
      />

      <div className="flex flex-col gap-7">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatCard label="Total" value={formatBRL(venda.valor_total)} />
          <StatCard
            label="Custo"
            value={formatBRL(venda.custo_total)}
            tone="negative"
            hint={outrosGastos > 0 ? `inclui ${formatBRL(outrosGastos)} de outros gastos` : undefined}
          />
          <StatCard
            className="col-span-2 sm:col-span-1"
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

        <Grupo titulo="Itens">
          <ul className="-my-3 divide-y divide-line">
            {itens.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="break-words text-[17px] leading-snug text-ink">{item.produto_nome}</p>
                  <p className="text-[13px] text-ink-muted">
                    {item.quantidade} × {formatBRL(item.preco_unitario)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-[17px] tabular-nums text-ink">
                    {formatBRL(item.quantidade * Number(item.preco_unitario))}
                  </span>
                  {!cancelada && (
                    <DevolverItemButton
                      vendaId={venda.id}
                      itemId={item.id}
                      nome={item.produto_nome}
                      quantidade={item.quantidade}
                      precoUnitario={Number(item.preco_unitario)}
                      unidadesNaVenda={unidadesNaVenda}
                    />
                  )}
                </div>
              </li>
            ))}
          </ul>
          <dl className="space-y-1 border-t border-line pt-3 text-[15px]">
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
            {outrosGastos > 0 && (
              <div className="flex justify-between gap-3 text-ink-muted">
                <dt>Outros gastos (seu custo, fora do total)</dt>
                <dd className="tabular-nums">{formatBRL(outrosGastos)}</dd>
              </div>
            )}
          </dl>
        </Grupo>

        <Grupo titulo="Pagamento" semPadding>
          <LinhaInfo rotulo="Tipo" valor={venda.tipo_pagamento === "a_prazo" ? "A prazo ou parcelado" : "À vista"} />
          {venda.forma_pagamento && <LinhaInfo rotulo="Forma" valor={venda.forma_pagamento} />}
          {venda.canal && <LinhaInfo rotulo="Canal" valor={venda.canal} />}
          {venda.observacoes && (
            <p className="whitespace-pre-line border-t border-line px-4 py-3 text-[15px] text-ink-2">{venda.observacoes}</p>
          )}
        </Grupo>

        {venda.recibo_token && (
          <ReciboCard
            vendaId={venda.id}
            token={venda.recibo_token}
            clienteNome={venda.cliente_nome}
            clienteTelefone={(cliente?.telefone as string | null | undefined) ?? null}
            nomeNegocio={nomeNegocio}
          />
        )}

        {parcelas.length > 0 && (
          <>
            {/* celular: lista agrupada, sem tabela que rola de lado */}
            <Grupo titulo="Parcelas" rodape={resumoParcelas} semPadding className="sm:hidden">
              {parcelas.map((p) => {
                const status = STATUS_PARCELA[p.status_efetivo];
                const texto = (
                  <>
                    <span className="block text-[17px] text-ink">
                      Parcela {p.numero_parcela}/{totalParcelas}
                      {p.entrada && <span className="text-ink-muted"> · entrada</span>}
                      {p.parcial && <span className="text-ink-muted"> · parte</span>}
                    </span>
                    <span className="block text-[13px] text-ink-muted">
                      {p.data_pagamento
                        ? `${p.parcial ? "Recebido" : "Paga"} em ${formatData(p.data_pagamento)}`
                        : `Vence ${formatData(p.vencimento)}`}
                      {" · "}
                      <span className={status.texto}>{status.label}</span>
                    </span>
                  </>
                );
                return (
                  <div key={p.id} className="flex items-center gap-3 border-t border-line px-4 py-3 first:border-t-0">
                    {p.status_efetivo === "pago" ? (
                      // parcela recebida: tocar abre os dados do recebimento, com desfazer no fim
                      janelaRecebimento(p, texto, "block min-w-0 flex-1 text-left")
                    ) : (
                      <div className="min-w-0 flex-1">{texto}</div>
                    )}
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-[17px] tabular-nums text-ink">{formatBRL(p.valor)}</span>
                      {p.status_efetivo !== "pago" && (
                        <ReceberButton id={p.id} valor={Number(p.valor)} numero={p.numero_parcela} cliente={venda.cliente_nome} />
                      )}
                    </div>
                  </div>
                );
              })}
            </Grupo>

            <section className="hidden sm:block">
              <h2 className="mb-1.5 px-4 text-[13px] uppercase text-ink-muted">Parcelas</h2>
              <Table compacta>
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
                          {p.numero_parcela}/{totalParcelas}
                          {p.entrada && <span className="block text-xs text-ink-muted">entrada</span>}
                          {p.parcial && <span className="block text-xs text-ink-muted">parte</span>}
                        </td>
                        <td className={`${tdClass} text-ink-2`}>
                          {formatData(p.vencimento)}
                          {p.data_pagamento && (
                            <span className="block text-xs text-ink-muted">
                              {p.parcial ? "recebido" : "paga"} em {formatData(p.data_pagamento)}
                            </span>
                          )}
                        </td>
                        <td className={`${tdClass} text-right tabular-nums text-ink`}>{formatBRL(p.valor)}</td>
                        <td className={tdClass}>
                          <Badge tone={status.tone}>{status.label}</Badge>
                        </td>
                        <td className={`${tdClass} text-right`}>
                          {p.status_efetivo !== "pago" ? (
                            <ReceberButton id={p.id} valor={Number(p.valor)} numero={p.numero_parcela} cliente={venda.cliente_nome} />
                          ) : (
                            janelaRecebimento(p, "Detalhes", btnSmallNeutro, "Ver recebimento ou desfazer")
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
              <p className="mt-1.5 px-4 text-[13px] leading-snug text-ink-muted">{resumoParcelas}</p>
            </section>
          </>
        )}

        {!cancelada && (
          <div className="flex justify-center">
            <Link href={`/vendas/${venda.id}/editar`} className={btnSecondary}>
              Editar venda
            </Link>
          </div>
        )}

        {/* ação destrutiva no fim da tela */}
        {!cancelada && (
          <div className="mt-3 flex justify-center">
            <CancelarVendaButton vendaId={venda.id} />
          </div>
        )}
      </div>
    </div>
  );
}
