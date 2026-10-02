"use client";

import Link from "next/link";
import { createContext, useContext, useState, type ReactNode } from "react";
import { formatBRL } from "@/lib/format";
import { lembrarPreferencia } from "@/lib/cookie";
import { Badge } from "@/components/ui";
import { MetasButton } from "./metas-button";

// Início: Hoje, Semana e Mês. A página já manda os números dos três períodos, então
// trocar de aba é instantâneo (sem ir ao servidor) e a última escolha fica num cookie
// para a próxima visita abrir no mesmo período, já com os dados.

export type Periodo = "hoje" | "semana" | "mes";

const PERIODOS: { valor: Periodo; rotulo: string }[] = [
  { valor: "hoje", rotulo: "Hoje" },
  { valor: "semana", rotulo: "Semana" },
  { valor: "mes", rotulo: "Mês" },
];

export interface VendaResumo {
  id: string;
  cliente: string | null;
  pagamento: string;
  aPrazo: boolean;
  hora: string;
  dataCurta: string;
  total: number;
  lucro: number;
  itens: string;
}

export interface DadosPeriodo {
  faturamento: number;
  lucro: number;
  metaVendas: number | null;
  metaLucro: number | null;
  tituloMeta: string;
  qtd: number;
  ticketMedio: number | null;
  vendas: VendaResumo[]; // as mais recentes
}

export type DadosPorPeriodo = Record<Periodo, DadosPeriodo>;

const Contexto = createContext<{ periodo: Periodo; dados: DadosPeriodo } | null>(null);
const Troca = createContext<(p: Periodo) => void>(() => {});

function usePeriodo() {
  const c = useContext(Contexto);
  if (!c) throw new Error("PeriodoProvider ausente");
  return c;
}

export function PeriodoProvider({
  inicial,
  dados,
  children,
}: {
  inicial: Periodo;
  dados: DadosPorPeriodo;
  children: ReactNode;
}) {
  const [periodo, setPeriodo] = useState<Periodo>(inicial);

  function trocar(p: Periodo) {
    setPeriodo(p);
    lembrarPreferencia("marcon-periodo", p);
  }

  return (
    <Troca.Provider value={trocar}>
      <Contexto.Provider value={{ periodo, dados: dados[periodo] }}>{children}</Contexto.Provider>
    </Troca.Provider>
  );
}

function Abas() {
  const { periodo } = usePeriodo();
  const trocar = useContext(Troca);
  return (
    <div className="grid grid-cols-3 rounded-full bg-fill p-[3px]" role="tablist" aria-label="Período">
      {PERIODOS.map((p) => (
        <button
          key={p.valor}
          type="button"
          role="tab"
          aria-selected={periodo === p.valor}
          onClick={() => trocar(p.valor)}
          className={`rounded-full px-4 py-1.5 text-center text-[13px] transition ${
            periodo === p.valor ? "bg-surface font-semibold text-ink shadow-sm" : "font-medium text-ink-2 hover:text-ink"
          }`}
        >
          {p.rotulo}
        </button>
      ))}
    </div>
  );
}

const C_EXTERNO = 263.9; // 2π·42
const C_INTERNO = 157.1; // 2π·25

function pct(valor: number, meta: number | null) {
  if (!meta) return 0;
  return Math.min(Math.max(valor / meta, 0), 1);
}

function Aneis({ vendas, lucro, metaVendas, metaLucro }: { vendas: number; lucro: number; metaVendas: number | null; metaLucro: number | null }) {
  const pv = pct(vendas, metaVendas);
  const pl = pct(lucro, metaLucro);
  const rotulo =
    metaVendas || metaLucro
      ? `Meta: vendas ${Math.round(pv * 100)}%, lucro ${Math.round(pl * 100)}%`
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

// Abas, anéis e números do período escolhido
export function PainelMetas({ metaMensalVendas, metaMensalLucro }: { metaMensalVendas: number | null; metaMensalLucro: number | null }) {
  const { dados } = usePeriodo();
  return (
    <section className="hairline flex min-w-0 flex-col gap-4 rounded-3xl bg-surface p-[18px] lg:col-span-2 lg:p-7">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] font-semibold text-ink-muted">{dados.tituloMeta}</p>
        <div className="w-full sm:w-auto">
          <Abas />
        </div>
      </div>
      <div className="flex items-center gap-[18px] lg:gap-9">
        <Aneis vendas={dados.faturamento} lucro={dados.lucro} metaVendas={dados.metaVendas} metaLucro={dados.metaLucro} />
        <div className="flex min-w-0 flex-col gap-2 lg:gap-4">
          <Meta rotulo="Vendas" valor={dados.faturamento} meta={dados.metaVendas} tom="text-brand-text" />
          <Meta rotulo="Lucro" valor={dados.lucro} meta={dados.metaLucro} tom="text-tile-positive" />
          <MetasButton metaVendas={metaMensalVendas} metaLucro={metaMensalLucro} />
        </div>
      </div>
    </section>
  );
}

const LINHA = "flex items-center gap-3 px-4 py-3 text-[17px] text-ink";

const TITULO: Record<Periodo, { lista: string; vazio: string }> = {
  hoje: { lista: "Vendas de hoje", vazio: "Nenhuma venda hoje ainda." },
  semana: { lista: "Vendas da semana", vazio: "Nenhuma venda da semana ainda." },
  mes: { lista: "Vendas do mês", vazio: "Nenhuma venda do mês ainda." },
};

// Lista de vendas do período: cartão no celular, tabela no computador
export function PainelVendas() {
  const { periodo, dados } = usePeriodo();
  const titulo = TITULO[periodo];
  const { vendas, qtd } = dados;

  return (
    <>
      <section className="lg:hidden">
        <h2 className="mb-1.5 px-4 text-[13px] uppercase text-ink-muted">{titulo.lista}</h2>
        <div className="hairline overflow-hidden rounded-3xl bg-surface">
          {vendas.length === 0 ? (
            <p className="px-4 py-6 text-center text-[15px] text-ink-muted">{titulo.vazio}</p>
          ) : (
            vendas.slice(0, 8).map((v) => (
              <Link
                key={v.id}
                href={`/vendas/${v.id}`}
                className={`${LINHA} border-t border-line first:border-t-0 transition hover:bg-fill/60 active:bg-fill`}
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">{v.cliente ?? "Venda avulsa"}</span>
                  <span className={`truncate text-[15px] ${v.aPrazo ? "text-warning" : "text-ink-muted"}`}>
                    {v.pagamento} · {periodo === "hoje" ? v.hora : v.dataCurta}
                  </span>
                </span>
                <span className="font-semibold tabular-nums">{formatBRL(v.total)}</span>
              </Link>
            ))
          )}
          {vendas.length > 0 && (
            <Link href="/vendas" className="block border-t border-line px-4 py-3 text-center text-[15px] text-brand-text hover:underline">
              Ver todas as vendas
            </Link>
          )}
        </div>
      </section>

      <section className="hairline hidden rounded-3xl bg-surface px-6 pb-4 pt-5 lg:block">
        <div className="flex items-start justify-between gap-4 pb-3">
          <div>
            <h2 className="text-[17px] font-bold tracking-tight text-ink">{titulo.lista}</h2>
            <p className="mt-0.5 text-[13px] text-ink-muted">
              {qtd} {qtd === 1 ? "venda" : "vendas"}
              {dados.ticketMedio !== null && <> · ticket médio {formatBRL(dados.ticketMedio)}</>}
            </p>
          </div>
          <Link href="/vendas" className="rounded-full bg-fill px-3.5 py-1.5 text-[13px] font-medium text-ink-2 transition hover:bg-fill-strong hover:text-ink">
            Ver todas as vendas
          </Link>
        </div>
        {vendas.length === 0 ? (
          <p className="py-8 text-center text-[15px] text-ink-muted">{titulo.vazio}</p>
        ) : (
          <>
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-ink-muted">
                  <th className="w-24 py-2 pl-2 font-semibold">{periodo === "hoje" ? "Hora" : "Data"}</th>
                  <th className="py-2 font-semibold">Cliente</th>
                  <th className="py-2 font-semibold">Itens</th>
                  <th className="w-32 py-2 font-semibold">Pagamento</th>
                  <th className="w-28 py-2 text-right font-semibold">Lucro</th>
                  <th className="w-28 py-2 pr-2 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                {vendas.slice(0, 10).map((v) => (
                  <tr key={v.id} className="relative border-b border-line/60 transition last:border-b-0 hover:bg-fill/60">
                    <td className="py-2.5 pl-2 text-ink-muted">
                      <Link href={`/vendas/${v.id}`} className="after:absolute after:inset-0" aria-label={`Abrir venda de ${v.cliente ?? "cliente avulso"}`}>
                        {periodo === "hoje" ? v.hora : v.dataCurta}
                      </Link>
                    </td>
                    <td className="py-2.5 font-medium text-ink">{v.cliente ?? <span className="font-normal text-ink-muted">Venda avulsa</span>}</td>
                    <td className="max-w-0 truncate py-2.5 pr-3 text-ink-2" title={v.itens}>
                      {v.itens}
                    </td>
                    <td className="py-2.5">
                      <Badge tone={v.aPrazo ? "warning" : "neutral"}>{v.pagamento}</Badge>
                    </td>
                    <td className={`py-2.5 text-right tabular-nums ${v.lucro >= 0 ? "text-positive" : "text-danger"}`}>
                      {v.lucro >= 0 ? "+" : "−"} {formatBRL(Math.abs(v.lucro))}
                    </td>
                    <td className="py-2.5 pr-2 text-right font-semibold tabular-nums text-ink">{formatBRL(v.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {qtd > 10 && (
              <p className="pt-3 text-center text-[13px] text-ink-muted">
                Mostrando as 10 mais recentes de {qtd}.{" "}
                <Link href="/vendas" className="text-brand-text hover:underline">
                  Ver todas
                </Link>
              </p>
            )}
          </>
        )}
      </section>
    </>
  );
}
