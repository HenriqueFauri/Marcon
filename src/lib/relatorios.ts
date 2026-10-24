import type { SupabaseClient } from "@supabase/supabase-js";
import { lerTudo as paginar } from "@/lib/ler-tudo";
import { deslocarMes, hojeISO, intervaloDoMes, nomeDoMes, somarDias } from "@/lib/format";

// Leituras para relatórios. O PostgREST corta cada resposta em 1000 linhas, então tudo aqui
// vem em páginas até acabar. A segurança é a RLS por owner_id das próprias tabelas.

// paginar é o lerTudo compartilhado (src/lib/ler-tudo.ts)
export { paginar };

export interface VendaResumo {
  id: string;
  data: string;
  canal: string | null;
  cliente_id: string | null;
  forma_pagamento: string | null;
  valor_total: number;
  custo_total: number;
}

export async function vendasConcluidas(supabase: SupabaseClient, inicio: string, fimExclusivo: string | null) {
  const linhas = await paginar<VendaResumo>((de, ate) => {
    let q = supabase
      .from("vendas")
      .select("id, data, canal, cliente_id, forma_pagamento, valor_total, custo_total")
      .eq("status", "concluida")
      .gte("data", inicio)
      .order("data")
      .order("id")
      .range(de, ate);
    if (fimExclusivo) q = q.lt("data", fimExclusivo);
    return q;
  });
  return linhas.map((v) => ({ ...v, valor_total: Number(v.valor_total), custo_total: Number(v.custo_total) }));
}

export interface TotaisVendas {
  vendas: number;
  receita: number;
  lucro: number;
}

export function totaisDeVendas(vendas: { valor_total: number; custo_total: number }[]): TotaisVendas {
  let receita = 0;
  let custo = 0;
  for (const v of vendas) {
    receita += v.valor_total;
    custo += v.custo_total;
  }
  return { vendas: vendas.length, receita, lucro: receita - custo };
}

export function margem(lucro: number, receita: number) {
  return receita > 0 ? (lucro / receita) * 100 : 0;
}

export function formatPct(valor: number) {
  return `${valor.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

// variação em relação ao período anterior: null quando não há base de comparação
export function variacao(atual: number, anterior: number) {
  if (anterior === 0) return null;
  return ((atual - anterior) / Math.abs(anterior)) * 100;
}

export function ticketMedio(t: TotaisVendas) {
  return t.vendas > 0 ? t.receita / t.vendas : 0;
}

// ---------------------------------------------------------------------------
// Período dos relatórios: 7 dias, 30 dias, este mês, mês passado, ano ou datas livres.
// Tudo vem da URL (?p=7d|mes|passado|ano e, no livre, ?p=custom&de=&ate=), então o link se compartilha.
// Cada período traz o período anterior, para a comparação dos cartões.
// ---------------------------------------------------------------------------

export type ChavePeriodo = "7d" | "30d" | "mes" | "passado" | "ano" | "custom";

export interface Intervalo {
  de: string; // primeiro dia (inclusive)
  ate: string; // último dia (inclusive)
  inicio: string; // igual a de
  fimExclusivo: string;
}

export interface PeriodoRelatorio extends Intervalo {
  chave: ChavePeriodo;
  dias: number;
  rotulo: string;
  anterior: Intervalo;
  rotuloAnterior: string;
}

const MAX_DIAS_CUSTOM = 731;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export const OPCOES_PERIODO: { chave: ChavePeriodo; label: string }[] = [
  { chave: "7d", label: "7 dias" },
  { chave: "30d", label: "30 dias" },
  { chave: "mes", label: "Este mês" },
  { chave: "passado", label: "Mês passado" },
  { chave: "ano", label: "Ano" },
  { chave: "custom", label: "Outro" },
];

function dataValida(v: string | undefined): v is string {
  if (!v || !ISO.test(v)) return false;
  const d = new Date(`${v}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

function intervalo(de: string, ate: string): Intervalo {
  return { de, ate, inicio: de, fimExclusivo: somarDias(ate, 1) };
}

export function diasEntre(de: string, ate: string) {
  return Math.round((new Date(`${ate}T12:00:00Z`).getTime() - new Date(`${de}T12:00:00Z`).getTime()) / 86400000) + 1;
}

// mesmo trecho do mês anterior (dias 1 a N), sem passar do último dia dele
function trechoDoMesAnterior(mes: string, diasCorridos: number): Intervalo {
  const { inicio, fimExclusivo } = intervaloDoMes(deslocarMes(mes, -1));
  const ultimo = somarDias(fimExclusivo, -1);
  const ate = somarDias(inicio, diasCorridos - 1);
  return intervalo(inicio, ate > ultimo ? ultimo : ate);
}

function aoAnterior(de: string, ate: string): Intervalo {
  const dias = diasEntre(de, ate);
  return intervalo(somarDias(de, -dias), somarDias(de, -1));
}

export function resolverPeriodoRelatorio(sp: { p?: string; de?: string; ate?: string }, hoje: string = hojeISO()): PeriodoRelatorio {
  const mesDeHoje = hoje.slice(0, 7);

  if (sp.p === "custom" && dataValida(sp.de) && dataValida(sp.ate)) {
    let de = sp.de;
    let ate = sp.ate;
    if (de > ate) [de, ate] = [ate, de];
    const limite = somarDias(ate, -(MAX_DIAS_CUSTOM - 1));
    if (de < limite) de = limite;
    return { ...intervalo(de, ate), chave: "custom", dias: diasEntre(de, ate), rotulo: "Período escolhido", anterior: aoAnterior(de, ate), rotuloAnterior: "período anterior" };
  }
  if (sp.p === "7d") {
    const de = somarDias(hoje, -6);
    return { ...intervalo(de, hoje), chave: "7d", dias: 7, rotulo: "Últimos 7 dias", anterior: aoAnterior(de, hoje), rotuloAnterior: "7 dias antes" };
  }
  if (sp.p === "mes") {
    const de = `${mesDeHoje}-01`;
    const dias = diasEntre(de, hoje);
    return { ...intervalo(de, hoje), chave: "mes", dias, rotulo: "Este mês", anterior: trechoDoMesAnterior(mesDeHoje, dias), rotuloAnterior: "mesmo trecho do mês passado" };
  }
  if (sp.p === "passado") {
    const mes = deslocarMes(mesDeHoje, -1);
    const { inicio, fimExclusivo } = intervaloDoMes(mes);
    const ate = somarDias(fimExclusivo, -1);
    const antMes = deslocarMes(mes, -1);
    const a = intervaloDoMes(antMes);
    return { ...intervalo(inicio, ate), chave: "passado", dias: diasEntre(inicio, ate), rotulo: nomeDoMes(mes), anterior: intervalo(a.inicio, somarDias(a.fimExclusivo, -1)), rotuloAnterior: nomeDoMes(antMes).split(" ")[0].toLowerCase() };
  }
  if (sp.p === "ano") {
    const ano = Number(hoje.slice(0, 4));
    const de = `${ano}-01-01`;
    const dias = diasEntre(de, hoje);
    const antDe = `${ano - 1}-01-01`;
    let antAte = somarDias(antDe, dias - 1);
    if (antAte > `${ano - 1}-12-31`) antAte = `${ano - 1}-12-31`;
    return { ...intervalo(de, hoje), chave: "ano", dias, rotulo: `Ano de ${ano}`, anterior: intervalo(antDe, antAte), rotuloAnterior: `mesmo trecho de ${ano - 1}` };
  }
  // padrão: últimos 30 dias
  const de = somarDias(hoje, -29);
  return { ...intervalo(de, hoje), chave: "30d", dias: 30, rotulo: "Últimos 30 dias", anterior: aoAnterior(de, hoje), rotuloAnterior: "30 dias antes" };
}

// parâmetros de URL que reproduzem o período (30 dias é o padrão e fica de fora)
export function paramsDoPeriodoRelatorio(p: PeriodoRelatorio): Record<string, string> {
  if (p.chave === "custom") return { p: "custom", de: p.de, ate: p.ate };
  if (p.chave === "30d") return {};
  return { p: p.chave };
}

export function hrefRelatorio(base: string, p: PeriodoRelatorio, extra: Record<string, string | undefined> = {}) {
  const qs = new URLSearchParams(paramsDoPeriodoRelatorio(p));
  for (const [k, v] of Object.entries(extra)) if (v) qs.set(k, v);
  const s = qs.toString();
  return s ? `${base}?${s}` : base;
}

// ---------------------------------------------------------------------------
// Evolução no tempo: por dia (até 31 dias), por semana (até 4 meses) ou por mês
// ---------------------------------------------------------------------------

export type Granularidade = "dia" | "semana" | "mes";

export interface PontoEvolucao {
  chave: string;
  rotulo: string; // curto, no eixo
  titulo: string; // completo, no destaque
  faturamento: number;
  lucro: number;
  vendas: number;
}

const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function diaCurto(iso: string) {
  return `${Number(iso.slice(8, 10))} de ${MESES_CURTOS[Number(iso.slice(5, 7)) - 1]}`;
}

export function granularidadeDe(dias: number): Granularidade {
  if (dias <= 31) return "dia";
  if (dias <= 124) return "semana";
  return "mes";
}

export function serieEvolucao(
  vendas: { data: string; valor_total: number; custo_total: number }[],
  de: string,
  ate: string,
): { gran: Granularidade; pontos: PontoEvolucao[] } {
  const gran = granularidadeDe(diasEntre(de, ate));
  const pontos: PontoEvolucao[] = [];
  const indicePorDia = new Map<string, number>();

  const abrir = (chave: string, rotulo: string, titulo: string) => {
    pontos.push({ chave, rotulo, titulo, faturamento: 0, lucro: 0, vendas: 0 });
    return pontos.length - 1;
  };

  if (gran === "dia") {
    for (let d = de; d <= ate; d = somarDias(d, 1)) {
      indicePorDia.set(d, abrir(d, d.slice(8, 10), diaCurto(d)));
    }
  } else if (gran === "semana") {
    let d = de;
    while (d <= ate) {
      const dow = new Date(`${d}T12:00:00Z`).getUTCDay(); // 0 = domingo
      const fimSemana = somarDias(d, dow === 0 ? 0 : 7 - dow);
      const fim = fimSemana > ate ? ate : fimSemana;
      const idx = abrir(d, `${d.slice(8, 10)}/${d.slice(5, 7)}`, d === fim ? diaCurto(d) : `${diaCurto(d)} a ${diaCurto(fim)}`);
      for (let x = d; x <= fim; x = somarDias(x, 1)) indicePorDia.set(x, idx);
      d = somarDias(fim, 1);
    }
  } else {
    const longo = diasEntre(de, ate) > 366;
    const porMes = new Map<string, number>();
    for (let d = de; d <= ate; d = somarDias(d, 1)) {
      const m = d.slice(0, 7);
      if (!porMes.has(m)) {
        const nome = MESES_CURTOS[Number(m.slice(5, 7)) - 1];
        porMes.set(m, abrir(m, longo ? `${nome}/${m.slice(2, 4)}` : nome, nomeDoMes(m)));
      }
      indicePorDia.set(d, porMes.get(m)!);
    }
  }

  for (const v of vendas) {
    const idx = indicePorDia.get(v.data);
    if (idx === undefined) continue;
    const p = pontos[idx];
    p.faturamento += v.valor_total;
    p.lucro += v.valor_total - v.custo_total;
    p.vendas += 1;
  }
  return { gran, pontos };
}
