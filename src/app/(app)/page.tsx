import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import type { ParcelaComVenda, ProdutoComEstoque, Venda } from "@/types/domain";
import { formatBRL, hojeISO, intervaloDoMes, mesAtual } from "@/lib/format";
import { situacaoEstoque } from "@/lib/estoque";
import { EmptyState, btnPrimary } from "@/components/ui";
import { IconAlert, IconBox, IconReceipt, IconWallet } from "@/components/icons";

export const metadata: Metadata = { title: "Início" };

const FUSO = "America/Sao_Paulo";
const C_EXTERNO = 263.9; // 2π·42
const C_INTERNO = 157.1; // 2π·25

function saudacao() {
  const hora = Number(new Intl.DateTimeFormat("en-GB", { timeZone: FUSO, hour: "2-digit", hour12: false }).format(new Date()));
  return hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";
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
    <svg viewBox="0 0 100 100" width="104" height="104" role="img" aria-label={rotulo} className="shrink-0 lg:h-[168px] lg:w-[168px]">
      <circle cx="50" cy="50" r="42" fill="none" strokeWidth="13" className="stroke-brand-tint" />
      <circle
        cx="50" cy="50" r="42" fill="none" strokeWidth="13" strokeLinecap="round"
        strokeDasharray={`${pv * C_EXTERNO} ${C_EXTERNO}`}
        transform="rotate(-90 50 50)" className="stroke-brand"
      />
      <circle cx="50" cy="50" r="25" fill="none" strokeWidth="13" className="stroke-positive-tint" />
      <circle
        cx="50" cy="50" r="25" fill="none" strokeWidth="13" strokeLinecap="round"
        strokeDasharray={`${pl * C_INTERNO} ${C_INTERNO}`}
        transform="rotate(-90 50 50)" className="stroke-positive"
      />
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
      <span className="truncate text-[26px] font-bold leading-[1.1] tracking-tight tabular-nums text-ink lg:text-[40px]">
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
      <div className="overflow-hidden rounded-3xl bg-surface">{children}</div>
    </section>
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
        <span className="rounded-full bg-danger px-2 text-[13px] font-semibold text-on-danger">{badge}</span>
      ) : (
        valor && <span className="text-ink-muted tabular-nums">{valor}</span>
      )}
      <span aria-hidden="true" className="text-lg text-ink-faint">›</span>
    </Link>
  );
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const mes = mesAtual();
  const hoje = hojeISO();
  const { inicio } = intervaloDoMes(mes);

  const [
    {
      data: { user },
    },
    { data: produtosData },
    { data: vendasData },
    { data: parcelasData },
    { data: caixaMesData },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("produtos_com_estoque").select("*").neq("status", "inativo"),
    supabase
      .from("vendas")
      .select("*")
      .gte("data", inicio)
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
  const vendasMes = (vendasData ?? []) as Venda[];
  const parcelas = (parcelasData ?? []) as ParcelaComVenda[];

  const faturamento = vendasMes.reduce((s, v) => s + Number(v.valor_total), 0);
  const lucro = vendasMes.reduce((s, v) => s + Number(v.valor_total) - Number(v.custo_total), 0);
  const vendasHoje = vendasMes.filter((v) => v.data === hoje);

  const caixaHoje = (caixaMesData ?? [])
    .filter((l) => l.data === hoje)
    .reduce((s, l) => s + (l.tipo === "entrada" ? Number(l.valor) : -Number(l.valor)), 0);

  const totalAReceber = parcelas.reduce((s, p) => s + Number(p.valor), 0);
  const atrasadas = parcelas.filter((p) => p.status_efetivo === "atrasado");
  const alertasEstoque = produtos.filter((p) => situacaoEstoque(p) !== "ok");

  const meta = user?.user_metadata ?? {};
  const metaVendas = typeof meta.meta_vendas === "number" ? meta.meta_vendas : null;
  const metaLucro = typeof meta.meta_lucro === "number" ? meta.meta_lucro : null;
  const primeiroNome = (
    (meta.nome as string | undefined) ?? (meta.full_name as string | undefined) ?? ""
  ).split(" ")[0];

  const semNada = produtos.length === 0 && vendasMes.length === 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3 px-1">
        <div>
          <p className="text-[15px] font-semibold uppercase tracking-wide text-ink-muted">{dataPorExtenso()}</p>
          <h1 className="text-[34px] font-bold leading-[1.15] tracking-tight text-ink">
            {primeiroNome ? `${saudacao()}, ${primeiroNome}` : "Início"}
          </h1>
        </div>
        <Link href="/vendas/novo" className={`${btnPrimary} hidden lg:inline-flex`}>
          Nova venda
        </Link>
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
            <section className="flex items-center gap-[18px] rounded-3xl bg-surface p-[18px] lg:col-span-2 lg:gap-9 lg:p-7">
              <Aneis vendas={faturamento} lucro={lucro} metaVendas={metaVendas} metaLucro={metaLucro} />
              <div className="flex min-w-0 flex-col gap-2 lg:gap-4">
                <Meta rotulo="Vendas" valor={faturamento} meta={metaVendas} tom="text-brand-text" />
                <Meta rotulo="Lucro" valor={lucro} meta={metaLucro} tom="text-positive" />
                {!metaVendas && !metaLucro && (
                  <Link href="/configuracoes" className="text-[13px] text-brand-text hover:underline">
                    Definir metas do mês
                  </Link>
                )}
              </div>
            </section>

            <Grupo titulo="Resumo">
              <LinhaResumo
                href="/contas-a-receber"
                icone={<IconReceipt width={17} height={17} />}
                tom="bg-warning-tint text-warning"
                rotulo="A receber"
                valor={formatBRL(totalAReceber)}
              />
              <LinhaResumo
                href="/contas-a-receber?status=atrasadas"
                icone={<IconAlert width={17} height={17} />}
                tom="bg-danger-tint text-danger"
                rotulo="Atrasado"
                badge={atrasadas.length}
                valor={atrasadas.length ? undefined : "Nada"}
              />
              <LinhaResumo
                href="/produtos?filtro=baixo"
                icone={<IconBox width={17} height={17} />}
                tom="bg-brand-tint text-brand-text"
                rotulo="Repor estoque"
                valor={alertasEstoque.length ? `${alertasEstoque.length} ${alertasEstoque.length === 1 ? "item" : "itens"}` : "Tudo ok"}
              />
              <LinhaResumo
                href="/fluxo-de-caixa"
                icone={<IconWallet width={17} height={17} />}
                tom="bg-positive-tint text-positive"
                rotulo="Caixa hoje"
                valor={formatBRL(caixaHoje)}
              />
            </Grupo>
          </div>

          <Grupo titulo="Vendas de hoje">
            {vendasHoje.length === 0 ? (
              <p className="px-4 py-6 text-center text-[15px] text-ink-muted">Nenhuma venda hoje ainda.</p>
            ) : (
              vendasHoje.slice(0, 8).map((v) => (
                <Link
                  key={v.id}
                  href={`/vendas/${v.id}`}
                  className={`${LINHA} border-t border-line first:border-t-0 transition hover:bg-fill/60 active:bg-fill`}
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate">{v.cliente_nome ?? "Venda avulsa"}</span>
                    <span className={`truncate text-[15px] ${v.tipo_pagamento === "a_prazo" ? "text-warning" : "text-ink-muted"}`}>
                      {v.tipo_pagamento === "a_prazo" ? "Fiado" : v.forma_pagamento ?? "À vista"} · {horaDaVenda(v.created_at)}
                    </span>
                  </span>
                  <span className="font-semibold tabular-nums">{formatBRL(v.valor_total)}</span>
                </Link>
              ))
            )}
            {vendasHoje.length > 0 && (
              <Link href="/vendas" className="block border-t border-line px-4 py-3 text-center text-[15px] text-brand-text hover:underline">
                Ver todas as vendas
              </Link>
            )}
          </Grupo>
        </>
      )}
    </div>
  );
}
