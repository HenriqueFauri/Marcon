import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { lerTudo } from "@/lib/ler-tudo";
import type { ParcelaComVenda } from "@/types/domain";
import { formatBRL, formatData, hojeISO, linkWhatsApp, somarDias } from "@/lib/format";
import { Grupo } from "@/components/ajustes";
import {
  Badge,
  EmptyState,
  ErrorMessage,
  Segmentos,
  StatCard,
  Table,
  btnIcon,
  btnSmallNeutro,
  tbodyClass,
  tdClass,
  thClass,
  theadClass,
} from "@/components/ui";
import { IconWhatsapp } from "@/components/icons";
import { CaixaTopo } from "../caixa/topo";
import { ReceberButton } from "./receber-button";
import { DesfazerRecebimento } from "./desfazer-recebimento";

export const metadata: Metadata = { title: "Caixa" };

const FILTROS = [
  { valor: "abertas", label: "Em aberto" },
  { valor: "atrasadas", label: "Atrasadas" },
  { valor: "pagas", label: "Pagas" },
  { valor: "todas", label: "Todas" },
] as const;

type Filtro = (typeof FILTROS)[number]["valor"];

const parcelasTexto = (n: number) => `${n} ${n === 1 ? "parcela" : "parcelas"}`;

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
    // todas as parcelas, página a página: os totais saem delas e o PostgREST corta cada consulta em 1000 linhas
    lerTudo((de, ate) =>
      supabase
        .from("parcelas_com_status")
        .select("*, vendas(cliente_nome, cliente_id, status, clientes(telefone))")
        .order("vencimento")
        .order("created_at")
        .order("id")
        .range(de, ate),
    ).then(
      (linhas) => ({ data: linhas, error: null }),
      (e: unknown) => ({ data: null, error: { message: e instanceof Error ? e.message : String(e) } }),
    ),
    supabase.auth.getUser(),
  ]);
  const chavePix = ((user?.user_metadata?.empresa_pix as string | undefined) ?? "").trim();

  if (error) {
    return (
      <div>
        <CaixaTopo aba="receber" />
        <ErrorMessage>Não foi possível carregar o que você tem a receber: {error.message}</ErrorMessage>
      </div>
    );
  }

  const parcelas = (data ?? []) as ParcelaComVenda[];
  const abertas = parcelas.filter((p) => p.status_efetivo !== "pago");
  const atrasadas = parcelas.filter((p) => p.status_efetivo === "atrasado");
  const hoje = hojeISO();
  const em7dias = somarDias(hoje, 7);
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

  // tudo o que a linha mostra, igual no celular e no computador
  const linhas = visiveis.map((p) => {
    const cliente = p.vendas?.cliente_nome ?? null;
    const aberta = p.status_efetivo !== "pago";
    const atrasada = p.status_efetivo === "atrasado";
    const emPartes = aberta ? (jaRecebido.get(chave(p)) ?? 0) : 0;
    const lembrete =
      emPartes > 0
        ? `do que falta da parcela ${p.numero_parcela}: ${formatBRL(p.valor)}`
        : `da parcela ${p.numero_parcela} de ${formatBRL(p.valor)}`;
    const pix = chavePix ? `\n\nPra pagar no PIX, a chave é:\n${chavePix}` : "";
    const whatsapp = aberta
      ? linkWhatsApp(
          p.vendas?.clientes?.telefone,
          `Olá${cliente ? ", " + cliente.split(" ")[0] : ""}! Passando para lembrar ${lembrete}, com vencimento em ${formatData(p.vencimento)}.${pix}`,
        )
      : null;
    const quando = p.data_pagamento
      ? `${p.parcial ? "recebido" : "paga"} em ${formatData(p.data_pagamento)}`
      : `${atrasada ? "venceu" : "vence"} ${formatData(p.vencimento)}`;
    const extra = [
      p.parcial && p.status === "pago" ? "parte recebida" : null,
      emPartes > 0 ? `já recebeu ${formatBRL(emPartes)}` : null,
    ].filter(Boolean);
    const detalhe = [`Parcela ${p.numero_parcela}`, quando, ...extra].join(" · ");
    const acoes = (
      <>
        {whatsapp && (
          <a
            href={whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Cobrar ${cliente ?? "cliente"} no WhatsApp`}
            title="Cobrar no WhatsApp"
            className={btnIcon}
          >
            <IconWhatsapp width={18} height={18} />
          </a>
        )}
        {aberta && <ReceberButton id={p.id} valor={Number(p.valor)} numero={p.numero_parcela} cliente={cliente} />}
      </>
    );
    // parcela recebida: tocar abre os dados do recebimento, com desfazer no fim
    const janela = (trigger: ReactNode, triggerClassName: string, triggerLabel?: string) => (
      <DesfazerRecebimento
        id={p.id}
        valor={Number(p.valor)}
        numero={p.numero_parcela}
        cliente={cliente}
        dataPagamento={p.data_pagamento}
        vencimento={p.vencimento}
        parcial={p.parcial}
        entrada={p.entrada}
        cancelada={(p.vendas as { status?: string } | null)?.status === "cancelada"}
        vendaHref={`/vendas/${p.venda_id}`}
        trigger={trigger}
        triggerClassName={triggerClassName}
        triggerLabel={triggerLabel}
      />
    );
    return { p, cliente, aberta, atrasada, detalhe, acoes, janela };
  });

  const rodapePagas = "Toque na parcela recebida pra ver o recebimento ou desfazer.";

  return (
    <div>
      <CaixaTopo aba="receber" />

      <div className="flex flex-col gap-7">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Em aberto" value={formatBRL(soma(abertas))} hint={parcelasTexto(abertas.length)} />
          <StatCard
            label="Atrasado"
            value={formatBRL(soma(atrasadas))}
            tone={atrasadas.length ? "negative" : "neutral"}
            hint={parcelasTexto(atrasadas.length)}
          />
          <StatCard label="Vence em 7 dias" value={formatBRL(soma(proximas))} hint={parcelasTexto(proximas.length)} />
          <StatCard label="Recebido no mês" value={formatBRL(recebidoMes)} tone="positive" />
        </div>

        <Segmentos
          rotulo="Filtrar parcelas"
          className="sm:w-[28rem]"
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
            title={parcelas.length === 0 ? "Nada a receber" : "Nada por aqui"}
            description={
              parcelas.length === 0
                ? "Quando você fizer uma venda a prazo ou parcelada, as parcelas aparecem aqui."
                : "Nenhuma parcela neste filtro."
            }
          />
        ) : (
          <Grupo
            semPadding
            className="sm:hidden"
            rodape={
              filtro === "pagas" ? rodapePagas : abertas.length > 0 ? (
                <Rodape chavePix={chavePix} />
              ) : undefined
            }
          >
            <ul className="divide-y divide-line">
              {linhas.map(({ p, cliente, aberta, atrasada, detalhe, acoes, janela }) => {
                const texto = (
                  <>
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[17px] text-ink">{cliente ?? "Sem nome"}</span>
                      {atrasada && <Badge tone="negative">Atrasada</Badge>}
                    </span>
                    <span className="block text-[13px] leading-snug text-ink-muted">{detalhe}</span>
                  </>
                );
                return (
                  <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                    {aberta ? (
                      <Link href={`/vendas/${p.venda_id}`} className="min-w-0 flex-1">
                        {texto}
                      </Link>
                    ) : (
                      janela(texto, "block min-w-0 flex-1 text-left")
                    )}
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <span className="text-[17px] tabular-nums text-ink">{formatBRL(p.valor)}</span>
                      <div className="flex items-center gap-1">{acoes}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Grupo>
        )}

        {visiveis.length > 0 && (
          <div className="hidden sm:block">
            <Table compacta>
              <thead className={theadClass}>
                <tr>
                  <th className={thClass}>Vencimento</th>
                  <th className={thClass}>Cliente</th>
                  <th className={`${thClass} text-right`}>Valor</th>
                  <th className={`${thClass} text-right`}>
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody className={tbodyClass}>
                {linhas.map(({ p, cliente, aberta, atrasada, detalhe, acoes, janela }) => (
                  <tr key={p.id} className="hover:bg-fill/50">
                    <td className={`${tdClass} whitespace-nowrap ${atrasada ? "text-danger" : "text-ink-2"}`}>{formatData(p.vencimento)}</td>
                    <td className={tdClass}>
                      <span className="flex items-center gap-2">
                        <Link href={`/vendas/${p.venda_id}`} className="text-ink hover:underline">
                          {cliente ?? "Sem nome"}
                        </Link>
                        {atrasada && <Badge tone="negative">Atrasada</Badge>}
                      </span>
                      <span className="block text-xs text-ink-muted">{detalhe}</span>
                    </td>
                    <td className={`${tdClass} text-right tabular-nums text-ink`}>{formatBRL(p.valor)}</td>
                    <td className={`${tdClass} text-right`}>
                      <div className="flex items-center justify-end gap-1">
                        {acoes}
                        {!aberta && janela("Detalhes", btnSmallNeutro, "Ver recebimento ou desfazer")}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {filtro === "pagas" ? (
              <p className="mt-1.5 px-4 text-[13px] leading-snug text-ink-muted">{rodapePagas}</p>
            ) : abertas.length > 0 && (
              <p className="mt-1.5 px-4 text-[13px] leading-snug text-ink-muted">
                <Rodape chavePix={chavePix} />
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Rodape({ chavePix }: { chavePix: string }) {
  return chavePix ? (
    <>A cobrança pelo WhatsApp já vai com a sua chave PIX. Em Receber dá para lançar só uma parte da parcela.</>
  ) : (
    <>
      Em Receber dá para lançar só uma parte da parcela.{" "}
      <Link href="/configuracoes" className="font-medium text-brand-text hover:underline">
        Cadastre sua chave PIX
      </Link>{" "}
      pra ela ir junto na cobrança pelo WhatsApp.
    </>
  );
}
