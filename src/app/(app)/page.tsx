import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import type { ParcelaComVenda, ProdutoComEstoque, Venda } from "@/types/domain";
import { formatBRL, formatDataCurta, hojeISO, intervaloDoMes, mesAtual, nomeDoMes, somarDias } from "@/lib/format";
import { situacaoEstoque } from "@/lib/estoque";
import { EmptyState, btnPrimary } from "@/components/ui";
import { PainelMetas, PainelVendas, PeriodoProvider, type DadosPeriodo, type DadosPorPeriodo, type Periodo, type VendaResumo } from "./painel-periodo";
import { IconAlert, IconBox, IconPlus, IconReceipt, IconSearch, IconWallet } from "@/components/icons";

export const metadata: Metadata = { title: "Início" };

const FUSO = "America/Sao_Paulo";
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
  // o período vem da URL (?periodo=), senão da última escolha (cookie); na primeira vez, o mês
  const periodoParam = Array.isArray(sp.periodo) ? sp.periodo[0] : sp.periodo;
  const lembrado = (await cookies()).get("marcon-periodo")?.value;
  const escolhido = periodoParam ?? lembrado;
  const periodo: Periodo = escolhido === "hoje" || escolhido === "semana" ? escolhido : "mes";
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
    { data: saldoData },
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
    supabase.from("lancamentos_caixa").select("tipo, valor, data").gte("data", hoje).eq("afeta_caixa", true),
    // saldo somado no banco: somar no app cortava em 1000 lançamentos
    supabase.rpc("saldo_caixa", { p_ate: hoje }),
  ]);

  const produtos = (produtosData ?? []) as ProdutoComEstoque[];
  type VendaComItens = Venda & { venda_itens: { produto_nome: string; quantidade: number }[] | null };
  const todasVendas = (vendasData ?? []) as VendaComItens[];
  const parcelas = (parcelasData ?? []) as ParcelaComVenda[];

  const resumoDe = (v: VendaComItens): VendaResumo => ({
    id: v.id,
    cliente: v.cliente_nome,
    pagamento: v.tipo_pagamento === "a_prazo" ? "A prazo" : v.forma_pagamento ?? "À vista",
    aPrazo: v.tipo_pagamento === "a_prazo",
    hora: horaDaVenda(v.created_at),
    dataCurta: formatDataCurta(v.data),
    total: Number(v.valor_total),
    lucro: Number(v.valor_total) - Number(v.custo_total),
    itens: resumoItens(v.venda_itens),
  });

  const meta = user?.user_metadata ?? {};
  const metaMensalVendas = typeof meta.meta_vendas === "number" ? meta.meta_vendas : null;
  const metaMensalLucro = typeof meta.meta_lucro === "number" ? meta.meta_lucro : null;

  // a meta é mensal; em "hoje" e "semana" vale a fatia proporcional dos dias
  const dadosDe = (qual: Periodo): DadosPeriodo => {
    const limite = qual === "hoje" ? hoje : qual === "semana" ? inicioSemana : inicio;
    const lista = todasVendas.filter((v) => (qual === "hoje" ? v.data === hoje : v.data >= limite));
    const faturamento = lista.reduce((s, v) => s + Number(v.valor_total), 0);
    const fatia = qual === "mes" ? 1 : (qual === "hoje" ? 1 : 7) / diasNoMes(mes);
    return {
      faturamento,
      lucro: lista.reduce((s, v) => s + Number(v.valor_total) - Number(v.custo_total), 0),
      metaVendas: metaMensalVendas ? metaMensalVendas * fatia : null,
      metaLucro: metaMensalLucro ? metaMensalLucro * fatia : null,
      tituloMeta: qual === "mes" ? `Meta de ${nomeDoMes(mes).split(" ")[0].toLowerCase()}` : qual === "hoje" ? "Meta de hoje" : "Meta da semana",
      qtd: lista.length,
      ticketMedio: lista.length ? faturamento / lista.length : null,
      vendas: lista.slice(0, 10).map(resumoDe),
    };
  };
  const dadosPorPeriodo: DadosPorPeriodo = { hoje: dadosDe("hoje"), semana: dadosDe("semana"), mes: dadosDe("mes") };

  // dinheiro em caixa = saldo acumulado até hoje (não só o movimento do dia)
  const movimentoHoje = (caixaData ?? [])
    .filter((l) => l.data === hoje)
    .reduce((s, l) => s + (l.tipo === "entrada" ? Number(l.valor) : -Number(l.valor)), 0);
  const caixaHoje = Number(saldoData ?? 0);
  const textoMovimentoHoje = `${movimentoHoje >= 0 ? "+" : "−"} ${formatBRL(Math.abs(movimentoHoje))} hoje`;

  const totalAReceber = parcelas.reduce((s, p) => s + Number(p.valor), 0);
  const atrasadas = parcelas.filter((p) => p.status_efetivo === "atrasado");
  const valorAtrasado = atrasadas.reduce((s, p) => s + Number(p.valor), 0);
  const fimSemana = somarDias(hoje, 6);
  const vencemNaSemana = parcelas.filter((p) => p.status_efetivo !== "atrasado" && p.vencimento >= hoje && p.vencimento <= fimSemana);
  const valorVencemNaSemana = vencemNaSemana.reduce((s, p) => s + Number(p.valor), 0);
  const alertasEstoque = produtos.filter((p) => situacaoEstoque(p) !== "ok");

  const primeiroNome = (
    (meta.nome as string | undefined) ?? (meta.full_name as string | undefined) ?? ""
  ).split(" ")[0];

  const semNada = produtos.length === 0 && todasVendas.length === 0;

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
        <PeriodoProvider inicial={periodo} dados={dadosPorPeriodo}>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <PainelMetas metaMensalVendas={metaMensalVendas} metaMensalLucro={metaMensalLucro} />

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
                rotulo="Dinheiro em caixa"
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
                Dinheiro em caixa: <strong className="font-semibold text-ink">{formatBRL(caixaHoje)}</strong> ({textoMovimentoHoje})
              </p>
            </section>
          </div>

          <PainelVendas />
        </PeriodoProvider>
      )}
    </div>
  );
}
