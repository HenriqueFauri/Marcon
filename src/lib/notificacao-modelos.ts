import { formatBRL } from "@/lib/format";

export interface DadosVendaNotificacao {
  valor: number;
  lucro: number;
  desconto: number;
  cliente: string | null;
  canal: string | null;
  formaPagamento: string | null;
  itens: { nome: string; quantidade: number }[];
}

export interface ModeloNotificacao {
  id: string;
  nome: string;
  descricao: string;
  titulo: string;
  corpo: string;
}

// Modelos prontos para o aviso de venda, no estilo dos apps de vendas com
// notificação por venda aprovada (valor e lucro na tela de bloqueio).
export const MODELOS: ModeloNotificacao[] = [
  {
    id: "aprovada",
    nome: "Venda aprovada",
    descricao: "Valor, lucro, produto e canal — o mais completo.",
    titulo: "💸 Venda aprovada!",
    corpo: "Valor: {valor}\nLucro: {lucro} ({margem})\nProduto: {produto}\nCanal: {canal}",
  },
  {
    id: "lucro",
    nome: "Foco no lucro",
    descricao: "O lucro no título, para ver de relance.",
    titulo: "🤑 +{lucro} de lucro",
    corpo: "Venda de {valor}\n{itens}\n{cliente}",
  },
  {
    id: "comemorar",
    nome: "Bora comemorar",
    descricao: "Direto e animado.",
    titulo: "🎉 Vendeu! {valor}",
    corpo: "{itens}\n{canal}\nBora pra próxima!",
  },
  {
    id: "pagamento",
    nome: "Pagamento confirmado",
    descricao: "Destaca a forma de pagamento e o cliente.",
    titulo: "✅ Pagamento confirmado — {valor}",
    corpo: "{cliente}\n{forma_pagamento}\n{produto}",
  },
  {
    id: "simples",
    nome: "Simples",
    descricao: "Só o valor e o cliente.",
    titulo: "Nova venda registrada",
    corpo: "{valor} — {cliente}",
  },
];

export const MODELO_PADRAO = "aprovada";
export const MODELO_PERSONALIZADO = "personalizado";

export const VARIAVEIS: { chave: string; descricao: string }[] = [
  { chave: "valor", descricao: "Total da venda" },
  { chave: "lucro", descricao: "Lucro da venda" },
  { chave: "margem", descricao: "Margem de lucro (%)" },
  { chave: "desconto", descricao: "Desconto dado" },
  { chave: "produto", descricao: "Primeiro produto (+ quantos mais)" },
  { chave: "itens", descricao: "Todos os itens com quantidade" },
  { chave: "cliente", descricao: "Nome do cliente" },
  { chave: "canal", descricao: "Canal de venda" },
  { chave: "forma_pagamento", descricao: "Forma de pagamento" },
];

export const EXEMPLO: DadosVendaNotificacao = {
  valor: 189.9,
  lucro: 72.4,
  desconto: 10,
  cliente: "Maria Souza",
  canal: "Facebook Marketplace",
  formaPagamento: "PIX",
  itens: [
    { nome: "Tênis Casual", quantidade: 1 },
    { nome: "Meia Esportiva", quantidade: 2 },
  ],
};

function valoresDaVenda(d: DadosVendaNotificacao): Record<string, string> {
  const primeiro = d.itens[0];
  const extras = d.itens.length - 1;
  const margem = d.valor > 0 ? `${((d.lucro / d.valor) * 100).toFixed(0)}%` : "";
  return {
    valor: formatBRL(d.valor),
    lucro: formatBRL(d.lucro),
    margem,
    desconto: d.desconto > 0 ? formatBRL(d.desconto) : "",
    produto: primeiro ? `${primeiro.nome}${extras > 0 ? ` +${extras}` : ""}` : "",
    itens: d.itens.map((i) => `${i.quantidade}x ${i.nome}`).join(", "),
    cliente: d.cliente?.trim() ?? "",
    canal: d.canal?.trim() ?? "",
    forma_pagamento: d.formaPagamento?.trim() ?? "",
  };
}

const VARIAVEL_RE = /\{(\w+)\}/g;

// Linha do corpo que usa uma variável sem valor (ex.: venda sem cliente) some
// em vez de aparecer vazia ou com sobra de separador.
export function renderizarModelo(titulo: string, corpo: string, dados: DadosVendaNotificacao) {
  const valores = valoresDaVenda(dados);
  const trocar = (texto: string) => texto.replace(VARIAVEL_RE, (m, chave: string) => (chave in valores ? valores[chave] : m));

  const linhas = corpo
    .split("\n")
    .filter((linha) => {
      const usadas = [...linha.matchAll(VARIAVEL_RE)].map((m) => m[1]).filter((k) => k in valores);
      return !usadas.some((k) => valores[k] === "");
    })
    .map(trocar)
    .map((l) => l.trim())
    .filter(Boolean);

  return {
    titulo: trocar(titulo).replace(/\s+/g, " ").trim() || "Nova venda",
    corpo: linhas.join("\n"),
  };
}

export interface PreferenciaNotificacao {
  modelo: string;
  titulo: string;
  corpo: string;
}

export function resolverModelo(meta: Record<string, unknown> | undefined): { titulo: string; corpo: string; modelo: string } {
  const id = typeof meta?.notif_modelo === "string" ? meta.notif_modelo : MODELO_PADRAO;
  if (id === MODELO_PERSONALIZADO) {
    const titulo = typeof meta?.notif_titulo === "string" ? meta.notif_titulo : "";
    const corpo = typeof meta?.notif_corpo === "string" ? meta.notif_corpo : "";
    if (titulo.trim()) return { modelo: id, titulo, corpo };
  }
  const pronto = MODELOS.find((m) => m.id === id) ?? MODELOS[0];
  return { modelo: pronto.id, titulo: pronto.titulo, corpo: pronto.corpo };
}
