import { DIAS_DE_TESTE, cicloDe, type Ciclo } from "@/lib/planos";
import { dataISONoFuso, hojeISO, somarDias } from "@/lib/format";

// Onde o usuário está no ciclo de assinatura. O teste corre a partir da criação
// da conta e não exige linha na tabela assinaturas.
// "cancelada": cancelou, mas o período já pago ainda não acabou; o plano vale até proximoVencimento.
export type TipoSituacao = "teste" | "gratis" | "pendente" | "ativa" | "atrasada" | "cortesia" | "cancelada";

export interface Situacao {
  tipo: TipoSituacao;
  diasRestantes: number; // no teste, na cortesia com prazo e na cancelada que ainda vale
  fimDoTeste: string; // yyyy-mm-dd
  plano: string | null;
  ciclo: Ciclo; // mensal ou anual; sem assinatura, mensal
  proximoVencimento: string | null;
  cortesiaAte: string | null; // último dia da cortesia (yyyy-mm-dd); nulo em cortesia antiga, sem prazo
  cortesiaEm: string | null; // quando foi dada
  cortesiaNova: boolean; // dada nos últimos 2 dias: a tela avisa que ela chegou
  // a conta caiu no grátis nas últimas 24 horas (fim do teste) ou ontem foi o último dia da cortesia:
  // o aviso do topo explica o que mudou. Nulo no resto do tempo.
  virouGratisHoje: "teste" | "cortesia" | null;
  // sem plano pago valendo (teste, grátis ou pendente que nunca pagou): o que o banco aplica. Nulo com plano.
  contaComo: "teste" | "gratis" | null;
}

interface LinhaAssinatura {
  plano: string;
  ciclo?: string | null; // migration 0063
  status: "pendente" | "ativa" | "atrasada" | "cancelada" | "cortesia";
  proximo_vencimento: string | null;
  cortesia_ate?: string | null;
  cortesia_em?: string | null;
}

// Cortesia (plano Marcon dado pelo admin, sem cobrança) vale até cortesia_ate, esse dia incluído.
// Passou do prazo, a conta volta ao teste ou ao grátis, igual à regra do banco (plano_do_usuario).
export function cortesiaVale(linha: Pick<LinhaAssinatura, "status" | "cortesia_ate"> | null | undefined) {
  if (linha?.status !== "cortesia") return false;
  return !linha.cortesia_ate || linha.cortesia_ate >= hojeISO();
}

// Cancelada mantém o plano até o fim do período já pago (proximo_vencimento, esse dia incluído).
export function canceladaVale(linha: Pick<LinhaAssinatura, "status" | "proximo_vencimento"> | null | undefined) {
  if (linha?.status !== "cancelada" || !linha.proximo_vencimento) return false;
  return linha.proximo_vencimento >= hojeISO();
}

// Fim do período já pago que ainda não acabou, de quem cancelou ou assinou de novo depois de cancelar
// (a linha volta a pendente guardando a data). Pendente comum não tem data e devolve null.
export function periodoPagoAte(linha: Pick<LinhaAssinatura, "status" | "proximo_vencimento"> | null | undefined) {
  if (linha?.status !== "cancelada" && linha?.status !== "pendente") return null;
  if (!linha.proximo_vencimento || linha.proximo_vencimento < hojeISO()) return null;
  return linha.proximo_vencimento;
}

// dias que faltam, contando hoje: no último dia vale 1
function diasAteIso(iso: string) {
  return Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${hojeISO()}T00:00:00Z`)) / 86_400_000) + 1;
}

const DIA_MS = 24 * 60 * 60 * 1000;

export function situacaoDaAssinatura(linha: LinhaAssinatura | null, contaCriadaEm: string | Date): Situacao {
  const fim = new Date(new Date(contaCriadaEm).getTime() + DIAS_DE_TESTE * DIA_MS);
  const restanteMs = fim.getTime() - Date.now();
  // último dia do teste no fuso do negócio (o teste acaba durante esse dia, na hora em que a conta foi criada)
  const fimDoTeste = dataISONoFuso(fim);
  // dias contados pelo calendário: "último dia" é o dia do fim, não as últimas 24 horas. No primeiro dia
  // da conta o calendário pode dar 15; fica em 14.
  const diasRestantes = restanteMs > 0 ? Math.min(DIAS_DE_TESTE, Math.max(1, diasAteIso(fimDoTeste))) : 0;
  // o que o banco considera quando não há plano pago (plano_do_usuario): teste enquanto ele dura, depois grátis
  const semPlano = restanteMs > 0 ? ("teste" as const) : ("gratis" as const);
  const virouGratisHoje =
    semPlano !== "gratis"
      ? null
      : linha?.status === "cortesia" && linha.cortesia_ate === somarDias(hojeISO(), -1)
        ? ("cortesia" as const)
        : -restanteMs < DIA_MS
          ? ("teste" as const)
          : null;

  const base = {
    diasRestantes,
    fimDoTeste,
    plano: linha?.plano ?? null,
    ciclo: cicloDe(linha?.ciclo),
    proximoVencimento: linha?.proximo_vencimento ?? null,
    cortesiaAte: null as string | null,
    cortesiaEm: null as string | null,
    cortesiaNova: false,
    virouGratisHoje: null as Situacao["virouGratisHoje"],
    contaComo: null as Situacao["contaComo"],
  };

  if (linha?.status === "ativa") return { ...base, tipo: "ativa" };
  if (cortesiaVale(linha)) {
    const ate = linha?.cortesia_ate ?? null;
    const em = linha?.cortesia_em ?? null;
    const nova = !!em && Date.now() - Date.parse(em) < 2 * DIA_MS;
    return { ...base, tipo: "cortesia", cortesiaAte: ate, cortesiaEm: em, cortesiaNova: nova, diasRestantes: ate ? diasAteIso(ate) : 0 };
  }
  if (linha?.status === "atrasada") return { ...base, tipo: "atrasada" };
  if (linha?.status === "pendente") {
    // pendente sem período pago (tocou em Assinar e não pagou): para o banco segue teste ou grátis
    if (periodoPagoAte(linha)) return { ...base, tipo: "pendente" };
    return { ...base, tipo: "pendente", contaComo: semPlano, virouGratisHoje };
  }
  // cancelou: o plano vale até o dia da cobrança que não vai acontecer, igual à regra do banco (plano_do_usuario)
  if (canceladaVale(linha)) return { ...base, tipo: "cancelada", diasRestantes: diasAteIso(linha!.proximo_vencimento!) };
  // sem linha, ou cancelada com o período já acabado: volta ao teste enquanto ele durar, depois ao grátis
  return { ...base, tipo: semPlano, contaComo: semPlano, virouGratisHoje };
}

// texto curto para o menu
export function rotuloDaSituacao(s: Situacao) {
  switch (s.tipo) {
    case "teste":
      return {
        texto: s.diasRestantes === 1 ? "Teste: último dia" : `Teste: ${s.diasRestantes} dias`,
        // nos últimos 3 dias o chip esquenta, para o fim do teste não pegar ninguém de surpresa
        tom: s.diasRestantes <= 3 ? ("warning" as const) : ("info" as const),
      };
    case "gratis":
      return { texto: "Plano grátis", tom: "neutral" as const };
    case "pendente":
      return { texto: "Pagamento pendente", tom: "warning" as const };
    case "ativa":
      return { texto: "Plano Marcon", tom: "positive" as const };
    case "atrasada":
      return { texto: "Pagamento atrasado", tom: "warning" as const };
    case "cancelada":
      return {
        texto: s.diasRestantes === 1 ? "Plano: último dia" : `Plano: ${s.diasRestantes} dias`,
        tom: s.diasRestantes <= 3 ? ("warning" as const) : ("neutral" as const),
      };
    case "cortesia":
      // com prazo, o chip conta os dias como no teste e esquenta nos últimos 3
      if (!s.cortesiaAte) return { texto: "Plano Marcon", tom: "positive" as const };
      return {
        texto: s.diasRestantes === 1 ? "Cortesia: último dia" : `Cortesia: ${s.diasRestantes} dias`,
        tom: s.diasRestantes <= 3 ? ("warning" as const) : ("positive" as const),
      };
  }
}
