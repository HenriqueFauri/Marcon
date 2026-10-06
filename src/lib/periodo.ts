import { deslocarMes, hojeISO, intervaloDoMes, mesAtual, mesValido, somarDias } from "@/lib/format";

// Período de consulta (vendas e fluxo de caixa): um mês, os últimos N meses (contando o atual),
// tudo ou um intervalo livre. Tudo vem da URL (?mes=, ?meses=, ?todo=1, ?de=&ate=), então o link pode
// ser compartilhado e a página funciona sem JavaScript.

export const OPCOES_MESES = [3, 6, 12] as const;
const MAX_MESES = 24;
const INICIO_TODO = "2000-01-01"; // provisório: a página troca pela data do primeiro registro (ver comecarNaPrimeira)
const MAX_DIAS = 731; // dois anos: mais que isso não ajuda ninguém e pesa na consulta
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export interface PeriodoCaixa {
  modo: "mes" | "meses" | "todo" | "intervalo";
  mes: string; // AAAA-MM, só faz sentido no modo "mes"
  meses: number | null;
  de: string; // primeiro dia (inclusive)
  ate: string; // último dia (inclusive)
  inicio: string;
  fimExclusivo: string;
}

function dataValida(v: string | undefined): v is string {
  if (!v || !ISO.test(v)) return false;
  const d = new Date(`${v}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

export function resolverPeriodo(
  sp: { mes?: string; meses?: string; todo?: string; de?: string; ate?: string },
  hoje: string = hojeISO(),
): PeriodoCaixa {
  if (dataValida(sp.de) && dataValida(sp.ate)) {
    let de = sp.de;
    let ate = sp.ate;
    if (de > ate) [de, ate] = [ate, de];
    const limite = somarDias(ate, -(MAX_DIAS - 1));
    if (de < limite) de = limite;
    return { modo: "intervalo", mes: mesAtual(), meses: null, de, ate, inicio: de, fimExclusivo: somarDias(ate, 1) };
  }

  if (sp.todo === "1") {
    return { modo: "todo", mes: mesAtual(), meses: null, de: INICIO_TODO, ate: hoje, inicio: INICIO_TODO, fimExclusivo: somarDias(hoje, 1) };
  }

  // últimos N meses: do dia 1 do mês (N-1) atrás até hoje
  const meses = Number(sp.meses);
  if (Number.isInteger(meses) && meses >= 1 && meses <= MAX_MESES) {
    const de = intervaloDoMes(deslocarMes(hoje.slice(0, 7), -(meses - 1))).inicio;
    return { modo: "meses", mes: mesAtual(), meses, de, ate: hoje, inicio: de, fimExclusivo: somarDias(hoje, 1) };
  }

  const mes = mesValido(sp.mes) ?? mesAtual();
  const { inicio, fimExclusivo } = intervaloDoMes(mes);
  return { modo: "mes", mes, meses: null, de: inicio, ate: somarDias(fimExclusivo, -1), inicio, fimExclusivo };
}

// parâmetros de URL que reproduzem o período (o mês atual é o padrão e fica de fora)
export function paramsDoPeriodo(p: PeriodoCaixa): Record<string, string> {
  if (p.modo === "intervalo") return { de: p.de, ate: p.ate };
  if (p.modo === "todo") return { todo: "1" };
  if (p.modo === "meses") return { meses: String(p.meses) };
  return p.mes !== mesAtual() ? { mes: p.mes } : {};
}

// "Todo" vai do primeiro registro (venda ou lançamento) até hoje; sem registro, fica só hoje
export function comecarNaPrimeira(p: PeriodoCaixa, primeira: string | null | undefined): PeriodoCaixa {
  if (p.modo !== "todo") return p;
  const de = primeira && primeira < p.ate ? primeira : p.ate;
  return { ...p, de, inicio: de };
}
