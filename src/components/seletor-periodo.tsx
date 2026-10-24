import Link from "next/link";
import { IconChevronLeft, IconChevronRight } from "@/components/icons";
import { Segmentos, btnSecondary, inputClass } from "@/components/ui";
import { deslocarMes, formatDataCurta, mesAtual, nomeDoMes } from "@/lib/format";
import { OPCOES_MESES, type PeriodoCaixa } from "@/lib/periodo";
import { OPCOES_PERIODO, hrefRelatorio, type PeriodoRelatorio } from "@/lib/relatorios";

// Seletor de período único do app. Tudo na URL (funciona sem JavaScript e o link se compartilha),
// sempre com o controle segmentado (Segmentos), que no celular quebra em duas fileiras de três e
// nunca passa da largura. Três jeitos, escolhidos por `tipo`:
//
// - "caixa" (Vendas, Fluxo de caixa): Mês | 3 meses | 6 meses | 12 meses | Tudo | Datas.
//   No "Mês" aparecem as setas de mês; em "Datas", o formulário De/Até. Lê PeriodoCaixa (lib/periodo).
// - "relatorio" (Relatórios, Análises de clientes): 7 dias | 30 dias | Este mês | Mês passado | Ano | Outro,
//   com a linha "1 out a 24 out · comparando com ...". Lê PeriodoRelatorio (lib/relatorios).
// - "mes" (Fechamento): só as setas de mês (?mes=AAAA-MM).
//
// `params` são filtros da página (ex.: tipo, ordem) que acompanham qualquer troca de período.

type Params = Record<string, string | undefined>;

export type SeletorPeriodoProps =
  | { tipo: "caixa"; periodo: PeriodoCaixa; basePath: string; params?: Params }
  | { tipo: "relatorio"; periodo: PeriodoRelatorio; basePath: string; params?: Params }
  | { tipo: "mes"; mes: string; basePath: string; params?: Params };

function montarHref(base: string, params: Params) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
  const s = qs.toString();
  return s ? `${base}?${s}` : base;
}

export function SeletorPeriodo(props: SeletorPeriodoProps) {
  if (props.tipo === "mes") return <SetasMes mes={props.mes} basePath={props.basePath} params={props.params} />;
  if (props.tipo === "relatorio") return <PeriodoDeRelatorio periodo={props.periodo} basePath={props.basePath} params={props.params} />;
  return <PeriodoDeCaixa periodo={props.periodo} basePath={props.basePath} params={props.params} />;
}

function PeriodoDeCaixa({ periodo, basePath, params = {} }: { periodo: PeriodoCaixa; basePath: string; params?: Params }) {
  const href = (extra: Params) => montarHref(basePath, { ...extra, ...params });
  const itens = [
    { href: href({}), label: "Mês", ativo: periodo.modo === "mes" },
    ...OPCOES_MESES.map((m) => ({
      href: href({ meses: String(m) }),
      label: `${m} meses`,
      ativo: periodo.modo === "meses" && periodo.meses === m,
    })),
    { href: href({ todo: "1" }), label: "Tudo", ativo: periodo.modo === "todo" },
    // "Datas" abre o intervalo já com as datas do período que está na tela
    { href: href({ de: periodo.de, ate: periodo.ate }), label: "Datas", ativo: periodo.modo === "intervalo" },
  ];

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Segmentos itens={itens} rotulo="Período" colunasCelular={3} className="w-full sm:max-w-xl" />
      {periodo.modo === "mes" && <SetasMes mes={periodo.mes} basePath={basePath} params={params} />}
      {periodo.modo === "intervalo" && <FormDatas basePath={basePath} de={periodo.de} ate={periodo.ate} params={params} />}
    </div>
  );
}

function PeriodoDeRelatorio({ periodo, basePath, params = {} }: { periodo: PeriodoRelatorio; basePath: string; params?: Params }) {
  const itens = OPCOES_PERIODO.map((o) => ({
    href: hrefRelatorio(basePath, { ...periodo, chave: o.chave }, params),
    label: o.label,
    ativo: periodo.chave === o.chave,
  }));

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Segmentos itens={itens} rotulo="Período" colunasCelular={3} className="w-full sm:max-w-xl" />
      {periodo.chave === "custom" && (
        <FormDatas basePath={basePath} de={periodo.de} ate={periodo.ate} params={{ p: "custom", ...params }} />
      )}
      <p className="px-1 text-[13px] text-ink-muted">
        {formatDataCurta(periodo.de)} a {formatDataCurta(periodo.ate)} · comparando com {periodo.rotuloAnterior}
      </p>
    </div>
  );
}

// Navegação de mês por link (?mes=AAAA-MM); o mês atual é o padrão e fica fora da URL.
function SetasMes({ mes, basePath, params = {} }: { mes: string; basePath: string; params?: Params }) {
  const href = (m: string) => montarHref(basePath, { ...params, mes: m !== mesAtual() ? m : undefined });
  const noFuturo = mes >= mesAtual();

  return (
    <div className="hairline flex w-full items-center justify-between rounded-full bg-surface sm:w-auto sm:self-start">
      <Link href={href(deslocarMes(mes, -1))} replace aria-label="Mês anterior" className="p-3 text-ink-muted hover:text-ink">
        <IconChevronLeft width={16} height={16} />
      </Link>
      <span className="min-w-36 flex-1 truncate px-1 text-center text-[15px] font-semibold text-ink">{nomeDoMes(mes)}</span>
      {noFuturo ? (
        <span className="p-3 text-ink-faint" aria-hidden="true">
          <IconChevronRight width={16} height={16} />
        </span>
      ) : (
        <Link href={href(deslocarMes(mes, 1))} replace aria-label="Próximo mês" className="p-3 text-ink-muted hover:text-ink">
          <IconChevronRight width={16} height={16} />
        </Link>
      )}
    </div>
  );
}

function FormDatas({ basePath, de, ate, params }: { basePath: string; de: string; ate: string; params: Params }) {
  return (
    <form action={basePath} method="get" className="flex flex-wrap items-end gap-2">
      {Object.entries(params).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      <label className="block min-w-0 flex-1 basis-36">
        <span className="mb-1 block text-[13px] font-medium text-ink-muted">De</span>
        <input type="date" name="de" required defaultValue={de} className={inputClass} />
      </label>
      <label className="block min-w-0 flex-1 basis-36">
        <span className="mb-1 block text-[13px] font-medium text-ink-muted">Até</span>
        <input type="date" name="ate" required defaultValue={ate} className={inputClass} />
      </label>
      <button type="submit" className={`${btnSecondary} w-full sm:w-auto`}>
        Ver período
      </button>
    </form>
  );
}
