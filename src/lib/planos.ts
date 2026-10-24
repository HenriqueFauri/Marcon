// Planos do Marcon. Por enquanto há um plano pago só, cobrado por mês ou por ano; um plano maior
// entra quando existir algo a mais para entregar nele (equipe, subdomínio da vitrine, assistente
// no WhatsApp).
//
// Os LIMITES são impostos pelo banco (função limites_do_plano, hoje na migration 0063) e o app
// lê o uso de lá (src/lib/uso.ts). Os números abaixo são só os textos da tela: ao mudar
// um limite, mude nos dois lugares.
export const PLANOS = {
  marcon: {
    nome: "Marcon",
    valor: 15.9, // mensal
    valorAnual: 149, // anual, cobrado de uma vez (decisão de 2026-10-24)
    // o pago ainda tem teto de 30 escritas com IA por mês: não dá para dizer "sem limite" de tudo
    resumo: "Vendas e produtos ilimitados.",
    inclui: [
      // na mesma ordem do plano grátis, para dar para comparar linha a linha; a vitrine, que só o
      // plano Marcon tem, vem por último. Sem "tudo do grátis": a lista já é completa.
      "Vendas e produtos ilimitados",
      "Até 10 fotos por produto e por variação",
      "Estoque, vendas a prazo e fluxo de caixa",
      "Anúncios prontos e lembrete de cobrança",
      "30 anúncios escritos com IA por mês",
      "Importar produtos, vendas e caixa de outro sistema",
      "Vitrine com link: o cliente monta o pedido e ele chega pronto no seu WhatsApp",
    ],
  },
} as const;

export type PlanoId = keyof typeof PLANOS;

export const PLANO_PADRAO: PlanoId = "marcon";

// o que sobra depois do teste, para quem não assina
export const PLANO_GRATIS = {
  nome: "Grátis",
  limites: { vendasPorMes: 20, produtos: 30, fotosPorProduto: 3, iaPorMes: 10 },
  inclui: [
    "Até 20 vendas por mês",
    "Até 30 produtos, com 3 fotos cada",
    "Estoque, vendas a prazo e fluxo de caixa",
    "Anúncios prontos e lembrete de cobrança",
    "10 anúncios escritos com IA por mês",
    "Importar seus produtos de outro sistema",
  ],
} as const;

// Ciclo de cobrança do plano Marcon. Fica na coluna assinaturas.ciclo (migration 0063).
export type Ciclo = "mensal" | "anual";

export const CICLOS: Record<Ciclo, { rotulo: string; valor: number; asaas: "MONTHLY" | "YEARLY"; sufixo: string; meses: number }> = {
  mensal: { rotulo: "Mensal", valor: PLANOS.marcon.valor, asaas: "MONTHLY", sufixo: "/mês", meses: 1 },
  anual: { rotulo: "Anual", valor: PLANOS.marcon.valorAnual, asaas: "YEARLY", sufixo: "/ano", meses: 12 },
};

export function ehCiclo(valor: unknown): valor is Ciclo {
  return valor === "mensal" || valor === "anual";
}

// assinaturas de antes da 0063 não têm ciclo: eram todas mensais
export function cicloDe(valor: unknown): Ciclo {
  return ehCiclo(valor) ? valor : "mensal";
}

const centavos = (n: number) => Math.round(n * 100) / 100;
// R$ 149 por ano = R$ 12,42 por mês
export const ANUAL_POR_MES = centavos(PLANOS.marcon.valorAnual / 12);
// 12 x R$ 15,90 = R$ 190,80; no anual paga R$ 149 e economiza R$ 41,80
export const ECONOMIA_ANUAL = centavos(PLANOS.marcon.valor * 12 - PLANOS.marcon.valorAnual);

export function ehPlano(valor: unknown): valor is PlanoId {
  return typeof valor === "string" && valor in PLANOS;
}

// assinaturas antigas guardam ids de planos que deixaram de existir
export function nomeDoPlano(id: string | null | undefined) {
  return id && ehPlano(id) ? PLANOS[id].nome : PLANOS[PLANO_PADRAO].nome;
}

export const DIAS_DE_TESTE = 14;
