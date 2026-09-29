import { formatBRL } from "@/lib/format";

// As notificações não têm texto fixo nem escolhido pelo usuário: cada evento tem
// várias frases descontraídas e uma delas é sorteada a cada aviso. O usuário só
// decide o que receber e quais dados aparecem.

export type Evento = "venda" | "meta" | "nivel_1k" | "nivel_5k" | "nivel_10k" | "cobranca";

// O que o usuário liga/desliga (os três níveis de faturamento andam juntos)
export type Grupo = "venda" | "meta" | "niveis" | "cobranca";

export const NIVEIS: { evento: Evento; valor: number }[] = [
  { evento: "nivel_1k", valor: 1000 },
  { evento: "nivel_5k", valor: 5000 },
  { evento: "nivel_10k", valor: 10000 },
];

export const EVENTOS: Evento[] = ["venda", "meta", "nivel_1k", "nivel_5k", "nivel_10k", "cobranca"];

const GRUPO_DO_EVENTO: Record<Evento, Grupo> = {
  venda: "venda",
  meta: "meta",
  nivel_1k: "niveis",
  nivel_5k: "niveis",
  nivel_10k: "niveis",
  cobranca: "cobranca",
};

export const GRUPOS: { id: Grupo; rotulo: string; descricao: string }[] = [
  { id: "venda", rotulo: "Vendas", descricao: "Um aviso a cada venda registrada." },
  { id: "meta", rotulo: "Meta batida", descricao: "Comemora quando você bate a meta do mês." },
  { id: "niveis", rotulo: "Marcos de faturamento", descricao: "Quando o mês passa de R$ 1 mil, R$ 5 mil e R$ 10 mil." },
  { id: "cobranca", rotulo: "Lembrete de cobrança", descricao: "Todo dia às 8h, se houver parcela vencendo ou atrasada." },
];

// ---------------------------------------------------------------------------
// Frases. Sem dados nem placeholders: o que o usuário desliga não pode escapar
// por aqui. Os dados entram numa linha separada (ver linhas abaixo).
// ---------------------------------------------------------------------------

interface Variante {
  titulo: string;
  corpo?: string;
}

const VARIANTES: Record<Evento, Variante[]> = {
  venda: [
    { titulo: "Caiu mais uma! 💸" },
    { titulo: "Vendeu! 🎉" },
    { titulo: "Tem venda nova aí 👀" },
    { titulo: "Ka-ching! 🤑" },
    { titulo: "Mais uma pra conta 🙌" },
    { titulo: "O caixa agradece 💰" },
    { titulo: "Cliente feliz, caixa feliz 😄" },
    { titulo: "Boa! Vendeu de novo 🔥" },
  ],
  meta: [
    { titulo: "Meta batida! 🎯", corpo: "Missão cumprida." },
    { titulo: "Meta no bolso 🏆" },
    { titulo: "Bateu a meta! 🥳" },
    { titulo: "Meta fechada, pode comemorar 🎉" },
    { titulo: "Objetivo do mês: concluído ✅" },
    { titulo: "Chegou lá! 🚀", corpo: "A meta ficou pra trás." },
    { titulo: "Era só uma meta, né? 😎" },
  ],
  nivel_1k: [
    { titulo: "Primeiro milhar do mês 🚀" },
    { titulo: "R$ 1 mil no caixa! 💰" },
    { titulo: "Já passou de mil! 🙌" },
    { titulo: "O mês começou bem 😎" },
    { titulo: "Mil reais e contando 🔥" },
    { titulo: "Aquecimento concluído 💪" },
  ],
  nivel_5k: [
    { titulo: "Cinco mil, sem freio 🔥" },
    { titulo: "R$ 5 mil no mês! 🎊" },
    { titulo: "O ritmo tá forte 💪" },
    { titulo: "Cinco mil batidos 🙌" },
    { titulo: "Isso já é mês bom 😎" },
    { titulo: "Subindo de nível ⭐" },
  ],
  nivel_10k: [
    { titulo: "Dez mil! Respira e comemora 👑" },
    { titulo: "R$ 10 mil no mês! 🏆" },
    { titulo: "Nível lendário desbloqueado ✨" },
    { titulo: "Dez mil batidos, que fase! 🚀" },
    { titulo: "Mês histórico 🥳" },
    { titulo: "Faturamento de respeito 👏" },
  ],
  cobranca: [
    { titulo: "Hora do lembrete gentil 🔔" },
    { titulo: "Tem gente te devendo 👀" },
    { titulo: "Dia de receber! 💵" },
    { titulo: "Uma mensagem hoje, dinheiro amanhã 📲" },
    { titulo: "Bora cobrar (com carinho) 😉" },
    { titulo: "Parcelas pedindo atenção ⏰" },
    { titulo: "Não esquece de cobrar 🧠" },
    { titulo: "Dinheiro seu na mão dos outros 😅" },
  ],
};

function hashTexto(texto: string) {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Escolha estável e sem estado: texto vira hash (aleatório na prática); número
// percorre as frases em ordem, então dois números seguidos nunca repetem.
export function escolherVariante(evento: Evento, semente: string | number): Variante {
  const lista = VARIANTES[evento];
  const indice = typeof semente === "number" ? Math.abs(Math.trunc(semente)) : hashTexto(semente);
  return lista[indice % lista.length];
}

// ---------------------------------------------------------------------------
// Dados que aparecem (o usuário liga/desliga cada um)
// ---------------------------------------------------------------------------

export const CAMPOS_VENDA = [
  { id: "produto", rotulo: "Produto" },
  { id: "valor", rotulo: "Valor" },
  { id: "lucro", rotulo: "Lucro" },
  { id: "cliente", rotulo: "Cliente" },
  { id: "canal", rotulo: "Canal" },
] as const;
export type CampoVenda = (typeof CAMPOS_VENDA)[number]["id"];

export const CAMPOS_COBRANCA = [
  { id: "total", rotulo: "Valor total" },
  { id: "nomes", rotulo: "Quem deve" },
] as const;
export type CampoCobranca = (typeof CAMPOS_COBRANCA)[number]["id"];

export interface DadosPreferidos {
  venda: Record<CampoVenda, boolean>;
  cobranca: Record<CampoCobranca, boolean>;
}

export const DADOS_PADRAO: DadosPreferidos = {
  venda: { produto: true, valor: true, lucro: true, cliente: false, canal: false },
  cobranca: { total: true, nomes: true },
};

export interface Preferencias {
  desativados: Grupo[];
  dados: DadosPreferidos;
}

export function lerPreferencias(meta: Record<string, unknown> | undefined): Preferencias {
  const ids = GRUPOS.map((g) => g.id);
  const desativados = Array.isArray(meta?.notif_desativados)
    ? (meta.notif_desativados as unknown[]).filter((g): g is Grupo => ids.includes(g as Grupo))
    : [];

  const salvo = (meta?.notif_dados ?? {}) as { venda?: Record<string, unknown>; cobranca?: Record<string, unknown> };
  const dados: DadosPreferidos = {
    venda: { ...DADOS_PADRAO.venda },
    cobranca: { ...DADOS_PADRAO.cobranca },
  };
  for (const c of CAMPOS_VENDA) if (typeof salvo.venda?.[c.id] === "boolean") dados.venda[c.id] = salvo.venda[c.id] as boolean;
  for (const c of CAMPOS_COBRANCA) {
    if (typeof salvo.cobranca?.[c.id] === "boolean") dados.cobranca[c.id] = salvo.cobranca[c.id] as boolean;
  }
  return { desativados, dados };
}

export function eventoAtivo(pref: Preferencias, evento: Evento) {
  return !pref.desativados.includes(GRUPO_DO_EVENTO[evento]);
}

// ---------------------------------------------------------------------------
// Linhas de dados: uma linha enxuta por aviso
// ---------------------------------------------------------------------------

export interface DadosVendaNotificacao {
  valor: number;
  lucro: number;
  cliente: string | null;
  canal: string | null;
  itens: { nome: string; quantidade: number }[];
}

export interface ParcelaParaCobrar {
  cliente: string | null;
  valor: number;
  diasAtraso: number;
}

export function nomeDoMes(mesISO: string) {
  return new Date(`${mesISO}-01T00:00:00`).toLocaleDateString("pt-BR", { month: "long" });
}

export function linhaDaVenda(d: DadosVendaNotificacao, campos: Record<CampoVenda, boolean>) {
  const primeiro = d.itens[0];
  const extras = d.itens.length - 1;
  const partes: (string | null)[] = [
    campos.produto && primeiro ? `${primeiro.nome}${extras > 0 ? ` +${extras}` : ""}` : null,
    campos.valor ? formatBRL(d.valor) : null,
    campos.lucro ? `lucro ${formatBRL(d.lucro)}` : null,
    campos.cliente && d.cliente?.trim() ? d.cliente.trim() : null,
    campos.canal && d.canal?.trim() ? d.canal.trim() : null,
  ];
  return partes.filter(Boolean).join(" · ");
}

export function linhaDaMeta(tipo: "vendas" | "lucro", atingido: number) {
  return `${tipo === "vendas" ? "Vendas" : "Lucro"} do mês: ${formatBRL(atingido)}`;
}

export function linhaDoNivel(faturamento: number, mesISO: string) {
  return `Faturamento de ${nomeDoMes(mesISO)}: ${formatBRL(faturamento)}`;
}

export function linhaDaCobranca(parcelas: ParcelaParaCobrar[], campos: Record<CampoCobranca, boolean>) {
  const porCliente = new Map<string, number>();
  for (const p of parcelas) {
    const nome = p.cliente?.trim() || "Cliente sem nome";
    porCliente.set(nome, (porCliente.get(nome) ?? 0) + p.valor);
  }
  const ordenados = [...porCliente.entries()].sort((a, b) => b[1] - a[1]).map(([nome]) => nome);
  const resto = ordenados.length - 3;
  const nomes = ordenados.slice(0, 3);
  const quem =
    resto > 0
      ? `${nomes.join(", ")} e mais ${resto}`
      : nomes.length > 1
        ? `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`
        : (nomes[0] ?? "");

  const contagem = `${parcelas.length} ${parcelas.length === 1 ? "parcela" : "parcelas"}`;
  const total = parcelas.reduce((s, p) => s + p.valor, 0);
  const primeira = campos.total ? `${contagem} · ${formatBRL(total)}` : contagem;
  return campos.nomes && quem ? `${primeira}\n${quem}` : primeira;
}

// ---------------------------------------------------------------------------
// Montagem
// ---------------------------------------------------------------------------

export function montarNotificacao(evento: Evento, semente: string | number, linhaDeDados: string) {
  const v = escolherVariante(evento, semente);
  return { titulo: v.titulo, corpo: [v.corpo, linhaDeDados].filter(Boolean).join("\n") };
}

// Exemplo com dados fictícios, respeitando o que o usuário escolheu mostrar
export function montarExemplo(pref: Preferencias, evento: Evento, semente: string | number) {
  const venda: DadosVendaNotificacao = {
    valor: 189.9,
    lucro: 72.4,
    cliente: "Maria Souza",
    canal: "Facebook Marketplace",
    itens: [
      { nome: "Tênis Casual", quantidade: 1 },
      { nome: "Meia Esportiva", quantidade: 2 },
    ],
  };
  const parcelas: ParcelaParaCobrar[] = [
    { cliente: "Maria", valor: 200, diasAtraso: 3 },
    { cliente: "João", valor: 250, diasAtraso: 0 },
  ];
  const linha =
    evento === "venda"
      ? linhaDaVenda(venda, pref.dados.venda)
      : evento === "meta"
        ? linhaDaMeta("vendas", 10120)
        : evento === "cobranca"
          ? linhaDaCobranca(parcelas, pref.dados.cobranca)
          : linhaDoNivel(NIVEIS.find((n) => n.evento === evento)!.valor + 230.5, "2026-09");
  return montarNotificacao(evento, semente, linha);
}
