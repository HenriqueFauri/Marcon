// Planos do Marcon. Por enquanto há um plano pago só; um plano maior entra quando
// existir algo a mais para entregar nele (vitrine pública, equipe).
export const PLANOS = {
  marcon: {
    nome: "Marcon",
    valor: 19.9,
    resumo: "Tudo liberado, sem limite.",
    inclui: [
      "Vendas e produtos ilimitados",
      "Anúncios por canal (Instagram, Mercado Livre, Shopee...)",
      "Lembrete diário de cobrança do fiado",
      "Metas do mês e avisos de faturamento",
    ],
  },
} as const;

export type PlanoId = keyof typeof PLANOS;

export const PLANO_PADRAO: PlanoId = "marcon";

// o que sobra depois do teste, para quem não assina
export const PLANO_GRATIS = {
  nome: "Grátis",
  limites: { vendasPorMes: 30, produtos: 50 },
  inclui: [
    "Até 30 vendas por mês",
    "Até 50 produtos",
    "Estoque, fiado e fluxo de caixa",
    "Aviso no celular a cada venda",
  ],
} as const;

export function ehPlano(valor: unknown): valor is PlanoId {
  return typeof valor === "string" && valor in PLANOS;
}

// assinaturas antigas guardam ids de planos que deixaram de existir
export function nomeDoPlano(id: string | null | undefined) {
  return id && ehPlano(id) ? PLANOS[id].nome : PLANOS[PLANO_PADRAO].nome;
}

export const DIAS_DE_TESTE = 14;
