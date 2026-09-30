// Planos do Marcon. Preços e nomes ainda são uma proposta (ver o doc de
// posicionamento): mudar aqui vale para a tela de assinatura e para a cobrança.
export const PLANOS = {
  loja: { nome: "Loja", valor: 19.9, resumo: "Tudo liberado, sem limite de produtos." },
  loja_pro: { nome: "Loja Pro", valor: 39.9, resumo: "Para quem quer mais recursos conforme eles chegarem." },
} as const;

export type PlanoId = keyof typeof PLANOS;

export function ehPlano(valor: unknown): valor is PlanoId {
  return typeof valor === "string" && valor in PLANOS;
}

export const DIAS_DE_TESTE = 14;

export function testeEmAndamento(fim: Date) {
  return fim.getTime() > Date.now();
}

// o teste corre a partir da criação da conta; sem assinatura, não há nada a guardar
export function fimDoTeste(criadoEm: string | Date) {
  const fim = new Date(criadoEm);
  fim.setDate(fim.getDate() + DIAS_DE_TESTE);
  return fim;
}
