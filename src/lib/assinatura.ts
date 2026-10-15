import { DIAS_DE_TESTE } from "@/lib/planos";
import { hojeISO } from "@/lib/format";

// Onde o usuário está no ciclo de assinatura. O teste corre a partir da criação
// da conta e não exige linha na tabela assinaturas.
export type TipoSituacao = "teste" | "gratis" | "pendente" | "ativa" | "atrasada" | "cortesia";

export interface Situacao {
  tipo: TipoSituacao;
  diasRestantes: number; // no teste e na cortesia com prazo
  fimDoTeste: string; // yyyy-mm-dd
  plano: string | null;
  proximoVencimento: string | null;
  cortesiaAte: string | null; // último dia da cortesia (yyyy-mm-dd); nulo em cortesia antiga, sem prazo
  cortesiaEm: string | null; // quando foi dada
  cortesiaNova: boolean; // dada nos últimos 2 dias: a tela avisa que ela chegou
}

interface LinhaAssinatura {
  plano: string;
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

// dias que faltam, contando hoje: no último dia vale 1
function diasAteIso(iso: string) {
  return Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${hojeISO()}T00:00:00Z`)) / 86_400_000) + 1;
}

const DIA_MS = 24 * 60 * 60 * 1000;

export function situacaoDaAssinatura(linha: LinhaAssinatura | null, contaCriadaEm: string | Date): Situacao {
  const fim = new Date(new Date(contaCriadaEm).getTime() + DIAS_DE_TESTE * DIA_MS);
  const restanteMs = fim.getTime() - Date.now();
  const diasRestantes = Math.max(0, Math.ceil(restanteMs / DIA_MS));

  const base = {
    diasRestantes,
    fimDoTeste: fim.toISOString().slice(0, 10),
    plano: linha?.plano ?? null,
    proximoVencimento: linha?.proximo_vencimento ?? null,
    cortesiaAte: null as string | null,
    cortesiaEm: null as string | null,
    cortesiaNova: false,
  };

  if (linha?.status === "ativa") return { ...base, tipo: "ativa" };
  if (cortesiaVale(linha)) {
    const ate = linha?.cortesia_ate ?? null;
    const em = linha?.cortesia_em ?? null;
    const nova = !!em && Date.now() - Date.parse(em) < 2 * DIA_MS;
    return { ...base, tipo: "cortesia", cortesiaAte: ate, cortesiaEm: em, cortesiaNova: nova, diasRestantes: ate ? diasAteIso(ate) : 0 };
  }
  if (linha?.status === "atrasada") return { ...base, tipo: "atrasada" };
  if (linha?.status === "pendente") return { ...base, tipo: "pendente" };
  // sem linha, ou assinatura cancelada: volta ao teste enquanto ele durar, depois ao grátis
  return { ...base, tipo: restanteMs > 0 ? "teste" : "gratis" };
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
    case "cortesia":
      // com prazo, o chip conta os dias como no teste e esquenta nos últimos 3
      if (!s.cortesiaAte) return { texto: "Plano Marcon", tom: "positive" as const };
      return {
        texto: s.diasRestantes === 1 ? "Cortesia: último dia" : `Cortesia: ${s.diasRestantes} dias`,
        tom: s.diasRestantes <= 3 ? ("warning" as const) : ("positive" as const),
      };
  }
}
