import type { Vitrine, VitrineProduto } from "@/lib/vitrine";

// Loja fictícia para ver a vitrine cheia em desenvolvimento (/loja/exemplo). Nunca vale em
// produção: a página só usa isto quando NODE_ENV não é "production".

function foto(texto: string, cor: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800"><rect width="800" height="800" fill="${cor}"/><text x="400" y="420" font-family="sans-serif" font-size="64" fill="#fff" text-anchor="middle">${texto}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function banner(texto: string, cor: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="640"><defs><linearGradient id="g"><stop offset="0" stop-color="${cor}"/><stop offset="1" stop-color="#111"/></linearGradient></defs><rect width="1600" height="640" fill="url(#g)"/><text x="1200" y="340" font-family="sans-serif" font-size="80" fill="#fff" text-anchor="middle" opacity=".35">${texto}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function produto(p: Partial<VitrineProduto> & Pick<VitrineProduto, "id" | "nome" | "preco">): VitrineProduto {
  return {
    marca: null,
    descricao: null,
    categoria: null,
    destaque: false,
    tem_variacoes: false,
    esgotado: false,
    ultimas: null,
    variacoes: [],
    fotos: [],
    ...p,
  };
}

export const VITRINE_EXEMPLO: Vitrine = {
  loja: {
    nome: "Loja Exemplo",
    logoUrl: null,
    whatsapp: "5511999999999",
    cor: "#0f766e",
    tema: "claro",
    boas_vindas: "Eletrônicos e utilidades com garantia. Entregamos na cidade toda.",
    anuncio: "Frete grátis acima de R$ 150",
    entrega: "ambos",
    frete_fixo: 10,
    instagram: "lojaexemplo",
    endereco: "Rua das Flores, 123, Centro, São Paulo",
    formas_pagamento: ["Cartão de crédito", "Dinheiro", "PIX"],
    ref: null,
  },
  banner: {
    urls: [banner("Banner 1", "#0f766e"), banner("Banner 2", "#7c3aed")],
    titulo: "Novidades da semana",
    subtitulo: "Fones, carregadores e acessórios com até 30% off",
    botao: "Ver produtos",
  },
  produtos: [
    produto({
      id: "p1",
      nome: "Fone KZ EDX Pro com microfone",
      marca: "KZ",
      categoria: "Fones",
      preco: 89.9,
      destaque: true,
      tem_variacoes: true,
      descricao: "Som limpo e grave forte. Cabo removível.\nAcompanha 3 tamanhos de borracha.",
      variacoes: [
        { id: "v1", nome: "Preto", preco: 89.9, esgotado: false, ultimas: 2 },
        { id: "v2", nome: "Transparente", preco: 94.9, esgotado: false, ultimas: null },
        { id: "v3", nome: "Azul", preco: 89.9, esgotado: true, ultimas: null },
      ],
      fotos: [
        { url: foto("KZ preto", "#1f2937"), variacaoId: "v1" },
        { url: foto("KZ cristal", "#64748b"), variacaoId: "v2" },
        { url: foto("KZ EDX", "#334155"), variacaoId: null },
      ],
    }),
    produto({
      id: "p2",
      nome: "Carregador turbo 20W USB-C",
      categoria: "Carregadores",
      preco: 49.9,
      destaque: true,
      ultimas: 3,
      fotos: [{ url: foto("20W", "#0369a1"), variacaoId: null }],
    }),
    produto({
      id: "p3",
      nome: "Parafusadeira 12V com 2 baterias e maleta",
      categoria: "Ferramentas",
      preco: 219.9,
      destaque: true,
      fotos: [{ url: foto("12V", "#b45309"), variacaoId: null }],
    }),
    produto({
      id: "p4",
      nome: "Smartwatch D20",
      categoria: "Relógios",
      preco: 59.9,
      esgotado: true,
      fotos: [{ url: foto("D20", "#4d7c0f"), variacaoId: null }],
    }),
    produto({
      id: "p5",
      nome: "Carrinho de controle remoto 4x4 recarregável",
      categoria: "Brinquedos",
      preco: 149.9,
      fotos: [{ url: foto("4x4", "#be123c"), variacaoId: null }],
    }),
    produto({ id: "p6", nome: "Panela elétrica de arroz 1L", categoria: "Casa", preco: 129.9 }),
    produto({
      id: "p7",
      nome: "Cabo USB-C reforçado 2 metros",
      categoria: "Carregadores",
      preco: 19.9,
      fotos: [{ url: foto("Cabo", "#0e7490"), variacaoId: null }],
    }),
  ],
};
