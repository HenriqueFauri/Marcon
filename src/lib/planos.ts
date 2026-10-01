// Planos do Marcon. Por enquanto há um plano pago só; um plano maior entra quando
// existir algo a mais para entregar nele (vitrine pública, equipe).
//
// Os LIMITES são impostos pelo banco (migration 0013, função limites_do_plano) e o app
// lê o uso de lá (src/lib/uso.ts). Os números abaixo são só os textos da tela: ao mudar
// um limite, mude nos dois lugares.
export const PLANOS = {
  marcon: {
    nome: "Marcon",
    valor: 15.9,
    resumo: "Tudo liberado, sem limite.",
    inclui: [
      "Tudo do plano grátis",
      "Vendas e produtos ilimitados",
      "Até 10 fotos por produto e por variação",
      "Importar vendas e caixa de outro sistema",
    ],
  },
} as const;

export type PlanoId = keyof typeof PLANOS;

export const PLANO_PADRAO: PlanoId = "marcon";

// o que sobra depois do teste, para quem não assina
export const PLANO_GRATIS = {
  nome: "Grátis",
  limites: { vendasPorMes: 30, produtos: 50, fotosPorProduto: 1 },
  inclui: [
    "Até 30 vendas por mês",
    "Até 50 produtos, com 1 foto cada",
    "Estoque, vendas a prazo e fluxo de caixa",
    "Anúncios por canal e lembrete de cobrança",
    "Importar seus produtos de outro sistema",
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
