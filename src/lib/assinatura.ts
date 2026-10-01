import { DIAS_DE_TESTE } from "@/lib/planos";

// Onde o usuário está no ciclo de assinatura. O teste corre a partir da criação
// da conta e não exige linha na tabela assinaturas.
export type TipoSituacao = "teste" | "gratis" | "pendente" | "ativa" | "atrasada" | "cortesia";

export interface Situacao {
  tipo: TipoSituacao;
  diasRestantes: number; // só faz sentido no teste
  fimDoTeste: string; // yyyy-mm-dd
  plano: string | null;
  proximoVencimento: string | null;
}

interface LinhaAssinatura {
  plano: string;
  status: "pendente" | "ativa" | "atrasada" | "cancelada" | "cortesia";
  proximo_vencimento: string | null;
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
  };

  if (linha?.status === "ativa") return { ...base, tipo: "ativa" };
  if (linha?.status === "cortesia") return { ...base, tipo: "cortesia" };
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
      return { texto: "Plano Marcon", tom: "positive" as const };
  }
}
