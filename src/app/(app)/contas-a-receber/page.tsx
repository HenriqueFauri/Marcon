import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { ParcelaComVenda } from "@/types/domain";
import { formatBRL, formatData, hojeISO, linkWhatsApp } from "@/lib/format";
import {
  Badge,
  EmptyState,
  ErrorMessage,
  PageHeader,
  StatCard,
  Table,
  tbodyClass,
  tdClass,
  thClass,
  theadClass,
} from "@/components/ui";
import { IconWhatsapp } from "@/components/icons";
import { MarcarPagoButton } from "./marcar-pago-button";

export const metadata: Metadata = { title: "Contas a receber" };

const STATUS = {
  pendente: { label: "Pendente", tone: "warning" },
  pago: { label: "Paga", tone: "positive" },
  atrasado: { label: "Atrasada", tone: "negative" },
} as const;

const FILTROS = [
  { valor: "abertas", label: "Em aberto" },
  { valor: "atrasadas", label: "Atrasadas" },
  { valor: "pagas", label: "Pagas" },
  { valor: "todas", label: "Todas" },
] as const;

type Filtro = (typeof FILTROS)[number]["valor"];

export default async function ContasAReceberPage({ searchParams }: PageProps<"/contas-a-receber">) {
  const sp = await searchParams;
  const filtro: Filtro = FILTROS.some((f) => f.valor === sp.status) ? (sp.status as Filtro) : "abertas";

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("parcelas_com_status")
    .select("*, vendas(cliente_nome, cliente_id, clientes(telefone))")
    .order("vencimento");

  if (error) {
    return (
      <div>
        <PageHeader title="Contas a receber" />
        <ErrorMessage>Não foi possível carregar as contas a receber: {error.message}</ErrorMessage>
      </div>
    );
  }

  const parcelas = (data ?? []) as ParcelaComVenda[];
  const abertas = parcelas.filter((p) => p.status_efetivo !== "pago");
  const atrasadas = parcelas.filter((p) => p.status_efetivo === "atrasado");
  const hoje = hojeISO();
  const em7dias = new Date(new Date(hoje + "T00:00:00").getTime() + 7 * 86400000).toISOString().slice(0, 10);
  const proximas = abertas.filter((p) => p.vencimento >= hoje && p.vencimento <= em7dias);
  const mesAtual = hoje.slice(0, 7);
  const recebidoMes = parcelas
    .filter((p) => p.status_efetivo === "pago" && p.data_pagamento?.startsWith(mesAtual))
    .reduce((s, p) => s + Number(p.valor), 0);

  const soma = (lista: ParcelaComVenda[]) => lista.reduce((s, p) => s + Number(p.valor), 0);

  const visiveis = {
    abertas,
    atrasadas,
    pagas: parcelas.filter((p) => p.status_efetivo === "pago").reverse(),
    todas: parcelas,
  }[filtro];

  return (
    <div>
      <PageHeader title="Contas a receber" description="Parcelas de vendas a prazo e fiado." />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total em aberto" value={formatBRL(soma(abertas))} tone="warning" hint={`${abertas.length} parcela(s)`} />
        <StatCard
          label="Atrasado"
          value={formatBRL(soma(atrasadas))}
          tone={atrasadas.length ? "negative" : "neutral"}
          hint={`${atrasadas.length} parcela(s)`}
        />
        <StatCard label="Vence em 7 dias" value={formatBRL(soma(proximas))} hint={`${proximas.length} parcela(s)`} />
        <StatCard label="Recebido no mês" value={formatBRL(recebidoMes)} tone="positive" />
      </div>

      <div className="mb-4 flex gap-1 overflow-x-auto" role="tablist">
        {FILTROS.map((f) => (
          <Link
            key={f.valor}
            href={f.valor === "abertas" ? "/contas-a-receber" : `/contas-a-receber?status=${f.valor}`}
            role="tab"
            aria-selected={filtro === f.valor}
            className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition ${
              filtro === f.valor ? "bg-neutral-800 font-medium text-white" : "text-neutral-400 hover:text-white"
            }`}
          >
            {f.label}
            {f.valor === "atrasadas" && atrasadas.length > 0 && (
              <span className="ml-1.5 rounded-full bg-red-500/20 px-1.5 text-xs text-red-400">{atrasadas.length}</span>
            )}
          </Link>
        ))}
      </div>

      {visiveis.length === 0 ? (
        <EmptyState
          title={parcelas.length === 0 ? "Nenhuma conta a receber" : "Nada por aqui"}
          description={
            parcelas.length === 0
              ? "Quando você fizer uma venda a prazo ou fiado, as parcelas aparecem aqui."
              : "Nenhuma parcela neste filtro."
          }
        />
      ) : (
        <Table compacta>
          <thead className={theadClass}>
            <tr>
              <th className={thClass}>Vencimento</th>
              <th className={thClass}>Cliente</th>
              <th className={`${thClass} text-right`}>Valor</th>
              <th className={`${thClass} hidden sm:table-cell`}>Status</th>
              <th className={`${thClass} text-right`}>
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody className={tbodyClass}>
            {visiveis.map((p) => {
              const status = STATUS[p.status_efetivo];
              const cliente = p.vendas?.cliente_nome;
              const whatsapp =
                p.status_efetivo !== "pago"
                  ? linkWhatsApp(
                      p.vendas?.clientes?.telefone,
                      `Olá${cliente ? ", " + cliente.split(" ")[0] : ""}! Passando para lembrar da parcela ${p.numero_parcela} de ${formatBRL(p.valor)}, com vencimento em ${formatData(p.vencimento)}.`,
                    )
                  : null;
              return (
                <tr key={p.id} className="hover:bg-neutral-900/60">
                  <td className={`${tdClass} whitespace-nowrap text-neutral-300`}>
                    {formatData(p.vencimento)}
                    {p.data_pagamento && (
                      <span className="block text-xs text-neutral-500">paga em {formatData(p.data_pagamento)}</span>
                    )}
                    <span className="mt-0.5 block sm:hidden">
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </span>
                  </td>
                  <td className={tdClass}>
                    <Link href={`/vendas/${p.venda_id}`} className="text-white hover:underline">
                      {cliente ?? "Sem nome"}
                    </Link>
                    <span className="block text-xs text-neutral-500">Parcela {p.numero_parcela}</span>
                  </td>
                  <td className={`${tdClass} text-right tabular-nums text-white`}>{formatBRL(p.valor)}</td>
                  <td className={`${tdClass} hidden sm:table-cell`}>
                    <Badge tone={status.tone}>{status.label}</Badge>
                  </td>
                  <td className={`${tdClass} text-right`}>
                    <div className="flex items-center justify-end gap-2">
                      {whatsapp && (
                        <a
                          href={whatsapp}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Cobrar ${cliente ?? "cliente"} no WhatsApp`}
                          title="Cobrar no WhatsApp"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-neutral-400 hover:bg-emerald-500/10 hover:text-emerald-400"
                        >
                          <IconWhatsapp width={16} height={16} />
                        </a>
                      )}
                      {p.status_efetivo !== "pago" && <MarcarPagoButton id={p.id} />}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </div>
  );
}
