import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import type { ParcelaComVenda, ProdutoComEstoque, Venda } from "@/types/domain";
import { formatBRL, formatDataCurta, hojeISO, intervaloDoMes, mesAtual, nomeDoMes } from "@/lib/format";
import { situacaoEstoque } from "@/lib/estoque";
import { EmptyState, btnPrimary } from "@/components/ui";
import { MetasButton } from "./metas-button";
import { IconAlert, IconBox, IconPlus, IconReceipt, IconSearch, IconWallet } from "@/components/icons";

export const metadata: Metadata = { title: "Início" };

const FUSO = "America/Sao_Paulo";
const C_EXTERNO = 263.9; // 2π·42
const C_INTERNO = 157.1; // 2π·25

type Periodo = "hoje" | "semana" | "mes";
const PERIODOS: { valor: Periodo; rotulo: string }[] = [
  { valor: "hoje", rotulo: "Hoje" },
  { valor: "semana", rotulo: "Semana" },
  { valor: "mes", rotulo: "Mês" },
];

function somarDias(iso: string, dias: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function diasNoMes(mes: string) {
  const [a, m] = mes.split("-").map(Number);
  return new Date(a, m, 0).getDate();
}

function resumoItens(itens: { produto_nome: string; quantidade: number }[] | null) {
  if (!itens?.length) return "—";
  const [primeiro, ...resto] = itens;
  const base = primeiro.quantidade > 1 ? `${primeiro.quantidade} × ${primeiro.produto_nome}` : primeiro.produto_nome;
  return resto.length ? `${base} +${resto.length}` : base;
}

function saudacao() {
  const hora = Number(new Intl.DateTimeFormat("en-GB", { timeZone: FUSO, hour: "2-digit", hour12: false }).format(new Date()));
  if (hora < 5) return "Boa madrugada";
  if (hora < 12) return "Bom dia";
  if (hora < 18) return "Boa tarde";
  return "Boa noite";
}

function dataPorExtenso() {
  const t = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, weekday: "long", day: "numeric", month: "long" }).format(new Date());
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function horaDaVenda(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

function pct(valor: number, meta: number | null) {
  if (!meta) return 0;
  return Math.min(Math.max(valor / meta, 0), 1);
}

function Aneis({ vendas, lucro, metaVendas, metaLucro }: { vendas: number; lucro: number; metaVendas: number | null; metaLucro: number | null }) {
  const pv = pct(vendas, metaVendas);
  const pl = pct(lucro, metaLucro);
  const rotulo =
    metaVendas || metaLucro
      ? `Meta do mês: vendas ${Math.round(pv * 100)}%, lucro ${Math.round(pl * 100)}%`
      : "Sem meta definida";
  return (
    <svg viewBox="0 0 100 100" width="104" height="104" role="img" aria-label={rotulo} className="shrink-0 lg:h-[200px] lg:w-[200px]">
      <circle cx="50" cy="50" r="42" fill="none" strokeWidth="13" className="stroke-brand-tint" />
      {pv > 0 && (
        <circle
          cx="50" cy="50" r="42" fill="none" strokeWidth="13" strokeLinecap="round"
          strokeDasharray={`${Math.max(pv * C_EXTERNO, 0.01)} ${C_EXTERNO}`}
          transform="rotate(-90 50 50)" className="stroke-brand"
        />
      )}
      <circle cx="50" cy="50" r="25" fill="none" strokeWidth="13" className="stroke-ring-track" />
      {pl > 0 && (
        <circle
          cx="50" cy="50" r="25" fill="none" strokeWidth="13" strokeLinecap="round"
          strokeDasharray={`${Math.max(pl * C_INTERNO, 0.01)} ${C_INTERNO}`}
          transform="rotate(-90 50 50)" className="stroke-tile-positive"
        />
      )}
    </svg>
  );
}

function Meta({ rotulo, valor, meta, tom }: { rotulo: string; valor: number; meta: number | null; tom: string }) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className={`text-[13px] font-semibold ${tom}`}>
        {rotulo}
        {meta ? ` · ${Math.round(pct(valor, meta) * 100)}%` : ""}
      </span>
      <span className="truncate text-[26px] font-bold leading-[1.1] tracking-tight tabular-nums text-ink lg:text-[44px]">
        {formatBRL(valor)}
        {meta ? <span className="text-[15px] font-normal text-ink-muted lg:text-xl"> / {formatBRL(meta).replace(",00", "")}</span> : null}
      </span>
    </div>
  );
}

function Grupo({ titulo, children, className = "" }: { titulo: string; children: ReactNode; className?: string }) {
  return (
    <section className={className}>
      <h2 className="mb-1.5 px-4 text-[13px] uppercase text-ink-muted">{titulo}</h2>
      <div className="hairline overflow-hidden rounded-3xl bg-surface">{children}</div>
    </section>
  );
}

function LinhaAtencao({
  href, tom, icone, texto, valor,
}: { href: string; tom: string; icone: ReactNode; texto: string; valor?: string }) {
  return (
    <Link href={href} className="flex items-center gap-3 border-t border-line py-2.5 text-sm text-ink first:border-t-0">
      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] ${tom}`}>{icone}</span>
      <span className="flex-1">{texto}</span>
      {valor ? <span className="font-semibold tabular-nums">{valor}</span> : <span aria-hidden="true" className="text-ink-muted">›</span>}
    </Link>
  );
}

const LINHA = "flex items-center gap-3 px-4 py-3 text-[17px] text-ink";

function LinhaResumo({
  href, icone, tom, rotulo, valor, badge,
}: { href: string; icone: ReactNode; tom: string; rotulo: string; valor?: string; badge?: number }) {
  return (
    <Link href={href} className={`${LINHA} border-t border-line first:border-t-0 transition hover:bg-fill/60 active:bg-fill`}>
      <span className={`flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg ${tom}`}>{icone}</span>
      <span className="flex-1">{rotulo}</span>
      {badge ? (
        <span className="rounded-full bg-tile-danger px-2 text-[13px] font-semibold text-on-tile-danger">{badge}</span>
      ) : (
        valor && <span className="text-ink-muted tabular-nums">{valor}</span>
      )}
      <span aria-hidden="true" className="text-lg text-ink-faint">›</span>
    </Link>
  );
}

export default async function DashboardPage({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const periodoParam = Array.isArray(sp.periodo) ? sp.periodo[0] : sp.periodo;
  const periodo: Periodo = periodoParam === "hoje" || periodoParam === "semana" ? periodoParam : "mes";
  const supabase = await createClient();
  const mes = mesAtual();
  const hoje = hojeISO();
  const { inicio } = intervaloDoMes(mes);
  const inicioSemana = somarDias(hoje, -6);
  const desde = inicioSemana < inicio ? inicioSemana : inicio;

  const [
    {
      data: { user },
    },
    { data: produtosData },
    { data: vendasData },
    { data: parcelasData },
    { data: caixaData },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("produtos_com_estoque").select("*").neq("status", "inativo"),
    supabase
      .from("vendas")
      .select("*, venda_itens(produto_nome, quantidade)")
      .gte("data", desde)
      .neq("status", "cancelada")
      .order("data", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("parcelas_com_status")
      .select("*, vendas(cliente_nome, cliente_id)")
      .neq("status", "pago")
      .order("vencimento"),
    supabase.from("lancamentos_caixa").select("tipo, valor, data").gte("data", hoje),
  ]);

  const produtos = (produtosData ?? []) as ProdutoComEstoque[];
  type VendaComItens = Venda & { venda_itens: { produto_nome: string; quantidade: number }[] | null };
  const todasVendas = (vendasData ?? []) as VendaComItens[];
  const parcelas = (parcelasData ?? []) as ParcelaComVenda[];

  const limite = periodo === "hoje" ? hoje : periodo === "semana" ? inicioSemana : inicio;
  const vendasPeriodo = todasVendas.filter((v) => v.data >= limite);
  const vendasHoje = todasVendas.filter((v) => v.data === hoje);
  const listaVendas = periodo === "hoje" ? vendasHoje : vendasPeriodo;

  const faturamento = vendasPeriodo.reduce((s, v) => s + Number(v.valor_total), 0);
  const lucro = vendasPeriodo.reduce((s, v) => s + Number(v.valor_total) - Number(v.custo_total), 0);

  const caixaHoje = (caixaData ?? [])
    .filter((l) => l.data === hoje)
    .reduce((s, l) => s + (l.tipo === "entrada" ? Number(l.valor) : -Number(l.valor)), 0);

  const totalAReceber = parcelas.reduce((s, p) => s + Number(p.valor), 0);
  const atrasadas = parcelas.filter((p) => p.status_efetivo === "atrasado");
  const valorAtrasado = atrasadas.reduce((s, p) => s + Number(p.valor), 0);
  const fimSemana = somarDias(hoje, 6);
  const vencemNaSemana = parcelas.filter((p) => p.status_efetivo !== "atrasado" && p.vencimento >= hoje && p.vencimento <= fimSemana);
  const valorVencemNaSemana = vencemNaSemana.reduce((s, p) => s + Number(p.valor), 0);
  const alertasEstoque = produtos.filter((p) => situacaoEstoque(p) !== "ok");

  const meta = user?.user_metadata ?? {};
  const metaMensalVendas = typeof meta.meta_vendas === "number" ? meta.meta_vendas : null;
  const metaMensalLucro = typeof meta.meta_lucro === "number" ? meta.meta_lucro : null;
  // a meta é mensal; em "hoje" e "semana" vale a fatia proporcional dos dias
  const fatia = periodo === "mes" ? 1 : (periodo === "hoje" ? 1 : 7) / diasNoMes(mes);
  const metaVendas = metaMensalVendas ? metaMensalVendas * fatia : null;
  const metaLucro = metaMensalLucro ? metaMensalLucro * fatia : null;
  const rotuloPeriodo = periodo === "hoje" ? "hoje" : periodo === "semana" ? "da semana" : "do mês";
  const primeiroNome = (
    (meta.nome as string | undefined) ?? (meta.full_name as string | undefined) ?? ""
  ).split(" ")[0];

  const semNada = produtos.length === 0 && todasVendas.length === 0;

  const pagamentoDe = (v: Venda) => (v.tipo_pagamento === "a_prazo" ? "Fiado" : v.forma_pagamento ?? "À vista");

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3 px-1">
        <div>
          <p className="text-[15px] font-semibold uppercase tracking-wide text-ink-muted">{dataPorExtenso()}</p>
          <h1 className="text-[34px] font-bold leading-[1.15] tracking-tight text-ink">
            {primeiroNome ? `${saudacao()}, ${primeiroNome}` : "Início"}
          </h1>
        </div>
        <div className="hidden items-center gap-3 lg:flex">
          <nav className="grid grid-cols-3 rounded-full bg-fill p-[3px]" aria-label="Período">
            {PERIODOS.map((p) => (
              <Link
                key={p.valor}
                href={p.valor === "mes" ? "/" : `/?periodo=${p.valor}`}
                aria-current={periodo === p.valor ? "page" : undefined}
                className={`rounded-full px-4 py-1 text-center text-xs transition ${
                  periodo === p.valor ? "bg-surface font-semibold text-ink shadow-sm" : "font-medium text-ink-2 hover:text-ink"
                }`}
              >
                {p.rotulo}
              </Link>
            ))}
          </nav>
          <form action="/produtos" className="flex w-44 items-center gap-1.5 rounded-full bg-fill px-3 py-1.5 text-ink-muted">
            <IconSearch width={14} height={14} strokeWidth={2.2} />
            <input
              name="q"
              type="search"
              placeholder="Buscar produto"
              aria-label="Buscar produto"
              className="w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-muted"
            />
          </form>
          <Link href="/vendas/novo" className={btnPrimary}>
            <IconPlus width={14} height={14} strokeWidth={2.6} /> Nova venda
          </Link>
        </div>
      </div>

      {semNada ? (
        <EmptyState
          title="Vamos começar?"
          description="Cadastre seus produtos com custo e preço. Depois é só registrar as vendas — estoque, lucro e caixa se atualizam sozinhos."
          action={
            <Link href="/produtos/novo" className={btnPrimary}>
              Cadastrar primeiro produto
            </Link>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <section className="hairline flex items-center gap-[18px] rounded-3xl bg-surface p-[18px] lg:col-span-2 lg:gap-9 lg:p-7">
              <Aneis vendas={faturamento} lucro={lucro} metaVendas={metaVendas} metaLucro={metaLucro} />
              <div className="flex min-w-0 flex-col gap-2 lg:gap-4">
                <p className="hidden text-[13px] font-semibold text-ink-muted lg:block">
                  {periodo === "mes" ? `Meta de ${nomeDoMes(mes).split(" ")[0].toLowerCase()}` : `Meta ${rotuloPeriodo}`}
                </p>
                <Meta rotulo="Vendas" valor={faturamento} meta={metaVendas} tom="text-brand-text" />
                <Meta rotulo="Lucro" valor={lucro} meta={metaLucro} tom="text-tile-positive" />
                <MetasButton metaVendas={metaMensalVendas} metaLucro={metaMensalLucro} />
              </div>
            </section>

            <Grupo titulo="Resumo" className="lg:hidden">
              <LinhaResumo
                href="/contas-a-receber"
                icone={<IconReceipt width={17} height={17} />}
                tom="bg-tile-warning text-on-tile-warning"
                rotulo="A receber"
                valor={formatBRL(totalAReceber)}
              />
              <LinhaResumo
                href="/contas-a-receber?status=atrasadas"
                icone={<IconAlert width={17} height={17} />}
                tom="bg-tile-danger text-on-tile-danger"
                rotulo="Atrasado"
                badge={atrasadas.length}
                valor={atrasadas.length ? undefined : "Nada"}
              />
              <LinhaResumo
                href="/produtos?filtro=baixo"
                icone={<IconBox width={17} height={17} />}
                tom="bg-brand text-on-brand"
                rotulo="Repor estoque"
                valor={alertasEstoque.length ? `${alertasEstoque.length} ${alertasEstoque.length === 1 ? "item" : "itens"}` : "Tudo ok"}
              />
              <LinhaResumo
                href="/fluxo-de-caixa"
                icone={<IconWallet width={17} height={17} />}
                tom="bg-tile-positive text-on-tile-positive"
                rotulo="Caixa hoje"
                valor={formatBRL(caixaHoje)}
              />
            </Grupo>

            <section className="hairline hidden flex-col rounded-3xl bg-surface p-[22px] lg:flex">
              <h2 className="pb-2 text-[13px] font-semibold text-ink-muted">Precisa de atenção</h2>
              <LinhaAtencao
                href="/contas-a-receber?status=atrasadas"
                tom="bg-tile-danger text-on-tile-danger"
                icone={<IconAlert width={15} height={15} />}
                texto={atrasadas.length ? `${atrasadas.length} ${atrasadas.length === 1 ? "parcela atrasada" : "parcelas atrasadas"}` : "Nada atrasado"}
                valor={atrasadas.length ? formatBRL(valorAtrasado) : undefined}
              />
              <LinhaAtencao
                href="/produtos?filtro=baixo"
                tom="bg-brand text-on-brand"
                icone={<IconBox width={15} height={15} />}
                texto={alertasEstoque.length ? `${alertasEstoque.length} ${alertasEstoque.length === 1 ? "produto acabando" : "produtos acabando"}` : "Estoque abastecido"}
              />
              <LinhaAtencao
                href="/contas-a-receber"
                tom="bg-tile-warning text-on-tile-warning"
                icone={<IconReceipt width={15} height={15} />}
                texto={vencemNaSemana.length ? `${vencemNaSemana.length} ${vencemNaSemana.length === 1 ? "vence" : "vencem"} esta semana` : "Nada vence esta semana"}
                valor={vencemNaSemana.length ? formatBRL(valorVencemNaSemana) : undefined}
              />
              <p className="mt-auto pt-3 text-xs text-ink-muted">
                Caixa hoje: <strong className="font-semibold text-ink">{formatBRL(caixaHoje)}</strong>
              </p>
            </section>
          </div>

          <Grupo titulo={periodo === "hoje" ? "Vendas de hoje" : periodo === "semana" ? "Vendas da semana" : "Vendas do mês"} className="lg:hidden">
            {listaVendas.length === 0 ? (
              <p className="px-4 py-6 text-center text-[15px] text-ink-muted">Nenhuma venda {rotuloPeriodo === "hoje" ? "hoje" : `${rotuloPeriodo}`} ainda.</p>
            ) : (
              listaVendas.slice(0, 8).map((v) => (
                <Link
                  key={v.id}
                  href={`/vendas/${v.id}`}
                  className={`${LINHA} border-t border-line first:border-t-0 transition hover:bg-fill/60 active:bg-fill`}
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate">{v.cliente_nome ?? "Venda avulsa"}</span>
                    <span className={`truncate text-[15px] ${v.tipo_pagamento === "a_prazo" ? "text-warning" : "text-ink-muted"}`}>
                      {pagamentoDe(v)} · {horaDaVenda(v.created_at)}
                    </span>
                  </span>
                  <span className="font-semibold tabular-nums">{formatBRL(v.valor_total)}</span>
                </Link>
              ))
            )}
            {listaVendas.length > 0 && (
              <Link href="/vendas" className="block border-t border-line px-4 py-3 text-center text-[15px] text-brand-text hover:underline">
                Ver todas as vendas
              </Link>
            )}
          </Grupo>

          <section className="hairline hidden rounded-3xl bg-surface px-6 pb-3 pt-2 lg:block">
            <div className="flex items-baseline justify-between pb-1.5 pt-3">
              <h2 className="text-[17px] font-bold tracking-tight text-ink">
                {periodo === "hoje" ? "Vendas de hoje" : periodo === "semana" ? "Vendas da semana" : "Vendas do mês"}
              </h2>
              <Link href="/vendas" className="text-[13px] text-brand-text hover:underline">
                Mostrar todas
              </Link>
            </div>
            {listaVendas.length === 0 ? (
              <p className="py-6 text-center text-[15px] text-ink-muted">Nenhuma venda {rotuloPeriodo} ainda.</p>
            ) : (
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-line text-left text-[11px] font-semibold text-ink-muted">
                    <th className="w-24 py-1.5 font-semibold">{periodo === "hoje" ? "Hora" : "Data"}</th>
                    <th className="py-1.5 font-semibold">Cliente</th>
                    <th className="py-1.5 font-semibold">Itens</th>
                    <th className="w-32 py-1.5 font-semibold">Pagamento</th>
                    <th className="w-28 py-1.5 text-right font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {listaVendas.slice(0, 8).map((v) => (
                    <tr key={v.id} className="even:bg-canvas/70">
                      <td className="rounded-l-lg py-2 pl-2 text-ink-muted">
                        <Link href={`/vendas/${v.id}`} className="block">
                          {periodo === "hoje" ? horaDaVenda(v.created_at) : formatDataCurta(v.data)}
                        </Link>
                      </td>
                      <td className="py-2 font-medium text-ink">{v.cliente_nome ?? "Venda avulsa"}</td>
                      <td className="max-w-0 truncate py-2 text-ink-muted">{resumoItens(v.venda_itens)}</td>
                      <td className={`py-2 ${v.tipo_pagamento === "a_prazo" ? "font-medium text-warning" : "text-ink"}`}>{pagamentoDe(v)}</td>
                      <td className="rounded-r-lg py-2 pr-2 text-right font-semibold tabular-nums text-ink">{formatBRL(v.valor_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </div>
  );
}
