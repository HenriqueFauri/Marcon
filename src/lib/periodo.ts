import { hojeISO, intervaloDoMes, mesAtual, mesValido, somarDias } from "@/lib/format";

// Período de consulta do fluxo de caixa: um mês, os últimos N dias ou um intervalo livre.
// Tudo vem da URL (?mes=, ?dias=, ?de=&ate=), então o link pode ser compartilhado e a
// página funciona sem JavaScript.

export const OPCOES_DIAS = [30, 60, 90, 120] as const;
const MAX_DIAS = 731; // dois anos: mais que isso não ajuda ninguém e pesa na consulta
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export interface PeriodoCaixa {
  modo: "mes" | "dias" | "intervalo";
  mes: string; // AAAA-MM, só faz sentido no modo "mes"
  dias: number | null;
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
  sp: { mes?: string; dias?: string; de?: string; ate?: string },
  hoje: string = hojeISO(),
): PeriodoCaixa {
  if (dataValida(sp.de) && dataValida(sp.ate)) {
    let de = sp.de;
    let ate = sp.ate;
    if (de > ate) [de, ate] = [ate, de];
    const limite = somarDias(ate, -(MAX_DIAS - 1));
    if (de < limite) de = limite;
    return { modo: "intervalo", mes: mesAtual(), dias: null, de, ate, inicio: de, fimExclusivo: somarDias(ate, 1) };
  }

  const dias = Number(sp.dias);
  if (Number.isInteger(dias) && dias >= 1 && dias <= MAX_DIAS) {
    const de = somarDias(hoje, -(dias - 1));
    return { modo: "dias", mes: mesAtual(), dias, de, ate: hoje, inicio: de, fimExclusivo: somarDias(hoje, 1) };
  }

  const mes = mesValido(sp.mes) ?? mesAtual();
  const { inicio, fimExclusivo } = intervaloDoMes(mes);
  return { modo: "mes", mes, dias: null, de: inicio, ate: somarDias(fimExclusivo, -1), inicio, fimExclusivo };
}

// parâmetros de URL que reproduzem o período (o mês atual é o padrão e fica de fora)
export function paramsDoPeriodo(p: PeriodoCaixa): Record<string, string> {
  if (p.modo === "intervalo") return { de: p.de, ate: p.ate };
  if (p.modo === "dias") return { dias: String(p.dias) };
  return p.mes !== mesAtual() ? { mes: p.mes } : {};
}
