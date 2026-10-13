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
  Segmentos,
} from "@/components/ui";
import { IconWhatsapp } from "@/components/icons";
import { ReceberButton } from "./receber-button";

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
  const [
    { data, error },
    {
      data: { user },
    },
  ] = await Promise.all([
    supabase
      .from("parcelas_com_status")
      .select("*, vendas(cliente_nome, cliente_id, clientes(telefone))")
      .order("vencimento")
      .order("created_at"),
    supabase.auth.getUser(),
  ]);
  const chavePix = ((user?.user_metadata?.empresa_pix as string | undefined) ?? "").trim();

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

  // quanto já entrou de cada parcela recebida em partes (as partes são linhas pagas com parcial = true)
  const chave = (p: ParcelaComVenda) => `${p.venda_id}:${p.numero_parcela}`;
  const jaRecebido = new Map<string, number>();
  for (const p of parcelas) {
    if (p.parcial && p.status === "pago") jaRecebido.set(chave(p), (jaRecebido.get(chave(p)) ?? 0) + Number(p.valor));
  }

  const visiveis = {
    abertas,
    atrasadas,
    pagas: parcelas.filter((p) => p.status_efetivo === "pago").reverse(),
    todas: parcelas,
  }[filtro];

  return (
    <div>
      <PageHeader title="Contas a receber" />

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

      <Segmentos
        rotulo="Filtrar parcelas"
        className="mb-4 sm:w-[28rem]"
        itens={FILTROS.map((f) => ({
          href: f.valor === "abertas" ? "/contas-a-receber" : `/contas-a-receber?status=${f.valor}`,
          label:
            f.valor === "atrasadas" && atrasadas.length > 0 ? (
              <>
                {f.label} <span className="text-danger">{atrasadas.length}</span>
              </>
            ) : (
              f.label
            ),
          ativo: filtro === f.valor,
        }))}
      />

      {visiveis.length === 0 ? (
        <EmptyState
          title={parcelas.length === 0 ? "Nenhuma conta a receber" : "Nada por aqui"}
          description={
            parcelas.length === 0
              ? "Quando você fizer uma venda a prazo ou parcelada, as parcelas aparecem aqui."
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
              const emPartes = p.status_efetivo !== "pago" ? (jaRecebido.get(chave(p)) ?? 0) : 0;
              const lembrete =
                emPartes > 0
                  ? `do que falta da parcela ${p.numero_parcela}: ${formatBRL(p.valor)}`
                  : `da parcela ${p.numero_parcela} de ${formatBRL(p.valor)}`;
              const pix = chavePix ? `\n\nPra pagar no PIX, a chave é:\n${chavePix}` : "";
              const whatsapp =
                p.status_efetivo !== "pago"
                  ? linkWhatsApp(
                      p.vendas?.clientes?.telefone,
                      `Olá${cliente ? ", " + cliente.split(" ")[0] : ""}! Passando para lembrar ${lembrete}, com vencimento em ${formatData(p.vencimento)}.${pix}`,
                    )
                  : null;
              return (
                <tr key={p.id} className="hover:bg-fill/50">
                  <td className={`${tdClass} whitespace-nowrap text-ink-2`}>
                    {formatData(p.vencimento)}
                    {p.data_pagamento && (
                      <span className="block text-xs text-ink-muted">
                        {p.parcial ? "recebido" : "paga"} em {formatData(p.data_pagamento)}
                      </span>
                    )}
                    <span className="mt-0.5 block sm:hidden">
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </span>
                  </td>
                  <td className={tdClass}>
                    <Link href={`/vendas/${p.venda_id}`} className="text-ink hover:underline">
                      {cliente ?? "Sem nome"}
                    </Link>
                    <span className="block text-xs text-ink-muted">
                      Parcela {p.numero_parcela}
                      {p.parcial && p.status === "pago" ? ", parte recebida" : ""}
                      {emPartes > 0 ? `, já recebeu ${formatBRL(emPartes)}` : ""}
                    </span>
                  </td>
                  <td className={`${tdClass} text-right tabular-nums text-ink`}>{formatBRL(p.valor)}</td>
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
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-muted hover:bg-brand-tint hover:text-brand-text"
                        >
                          <IconWhatsapp width={16} height={16} />
                        </a>
                      )}
                      {p.status_efetivo !== "pago" && (
                        <ReceberButton id={p.id} valor={Number(p.valor)} numero={p.numero_parcela} cliente={cliente ?? null} />
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}

      {abertas.length > 0 && (
        <p className="mt-3 px-4 text-[13px] text-ink-muted">
          {chavePix ? (
            "A cobrança pelo WhatsApp já vai com a sua chave PIX. Em Receber dá para lançar só uma parte da parcela."
          ) : (
            <>
              Em Receber dá para lançar só uma parte da parcela.{" "}
              <Link href="/configuracoes" className="font-medium text-brand-text hover:underline">
                Cadastre sua chave PIX
              </Link>{" "}
              pra ela ir junto na cobrança pelo WhatsApp.
            </>
          )}
        </p>
      )}
    </div>
  );
}
