import { formatBRL } from "@/lib/format";

// ---------------------------------------------------------------------------
// Eventos que geram notificação
// ---------------------------------------------------------------------------

export type Evento = "venda" | "meta" | "nivel_1k" | "nivel_5k" | "nivel_10k" | "cobranca";

// O que o usuário liga/desliga (os três níveis de faturamento andam juntos)
export type Grupo = "venda" | "meta" | "niveis" | "cobranca";

export const NIVEIS: { evento: Evento; valor: number }[] = [
  { evento: "nivel_1k", valor: 1000 },
  { evento: "nivel_5k", valor: 5000 },
  { evento: "nivel_10k", valor: 10000 },
];

export interface Variavel {
  chave: string;
  descricao: string;
}

export interface EventoInfo {
  id: Evento;
  grupo: Grupo;
  rotulo: string;
  descricao: string;
  variaveis: Variavel[];
  exemplo: Record<string, string>;
}

const VARIAVEIS_NIVEL: Variavel[] = [
  { chave: "faturamento", descricao: "Faturamento do mês até agora" },
  { chave: "nivel", descricao: "Nível atingido (ex.: R$ 5.000)" },
  { chave: "mes", descricao: "Nome do mês" },
];

const EXEMPLO_NIVEL = (nivel: number) => ({
  faturamento: formatBRL(nivel + 230.5),
  nivel: formatBRL(nivel),
  mes: "setembro",
});

export const EVENTOS: EventoInfo[] = [
  {
    id: "venda",
    grupo: "venda",
    rotulo: "Venda",
    descricao: "A cada venda registrada.",
    variaveis: [
      { chave: "valor", descricao: "Total da venda" },
      { chave: "lucro", descricao: "Lucro da venda" },
      { chave: "margem", descricao: "Margem de lucro (%)" },
      { chave: "desconto", descricao: "Desconto dado" },
      { chave: "produto", descricao: "Primeiro produto (+ quantos mais)" },
      { chave: "itens", descricao: "Todos os itens com quantidade" },
      { chave: "cliente", descricao: "Nome do cliente" },
      { chave: "canal", descricao: "Canal de venda" },
      { chave: "forma_pagamento", descricao: "Forma de pagamento" },
    ],
    exemplo: {
      valor: formatBRL(189.9),
      lucro: formatBRL(72.4),
      margem: "38%",
      desconto: formatBRL(10),
      produto: "Tênis Casual +1",
      itens: "1x Tênis Casual, 2x Meia Esportiva",
      cliente: "Maria Souza",
      canal: "Facebook Marketplace",
      forma_pagamento: "PIX",
    },
  },
  {
    id: "meta",
    grupo: "meta",
    rotulo: "Meta batida",
    descricao: "Quando o mês chega na meta de vendas ou de lucro definida em Metas do mês.",
    variaveis: [
      { chave: "tipo", descricao: "“de vendas” ou “de lucro”" },
      { chave: "meta", descricao: "Valor da meta" },
      { chave: "atingido", descricao: "Valor alcançado no mês" },
      { chave: "mes", descricao: "Nome do mês" },
    ],
    exemplo: { tipo: "de vendas", meta: formatBRL(10000), atingido: formatBRL(10120), mes: "setembro" },
  },
  {
    id: "nivel_1k",
    grupo: "niveis",
    rotulo: "R$ 1 mil",
    descricao: "Quando o faturamento do mês passa de R$ 1.000.",
    variaveis: VARIAVEIS_NIVEL,
    exemplo: EXEMPLO_NIVEL(1000),
  },
  {
    id: "nivel_5k",
    grupo: "niveis",
    rotulo: "R$ 5 mil",
    descricao: "Quando o faturamento do mês passa de R$ 5.000.",
    variaveis: VARIAVEIS_NIVEL,
    exemplo: EXEMPLO_NIVEL(5000),
  },
  {
    id: "nivel_10k",
    grupo: "niveis",
    rotulo: "R$ 10 mil",
    descricao: "Quando o faturamento do mês passa de R$ 10.000.",
    variaveis: VARIAVEIS_NIVEL,
    exemplo: EXEMPLO_NIVEL(10000),
  },
  {
    id: "cobranca",
    grupo: "cobranca",
    rotulo: "Cobrança",
    descricao: "Lembrete diário, às 8h, das parcelas que vencem hoje ou estão atrasadas.",
    variaveis: [
      { chave: "parcelas", descricao: "Ex.: “3 parcelas”" },
      { chave: "total", descricao: "Soma a receber" },
      { chave: "clientes", descricao: "Quem deve (até 3 nomes)" },
      { chave: "cliente", descricao: "Quem deve mais" },
      { chave: "atraso", descricao: "Maior atraso, ex.: “5 dias de atraso”" },
    ],
    exemplo: {
      parcelas: "3 parcelas",
      total: formatBRL(450),
      clientes: "Maria, João e mais 1",
      cliente: "Maria",
      atraso: "5 dias de atraso",
    },
  },
];

export const GRUPOS: { id: Grupo; rotulo: string; descricao: string }[] = [
  { id: "venda", rotulo: "Vendas", descricao: "Um aviso a cada venda registrada." },
  { id: "meta", rotulo: "Meta batida", descricao: "Comemora quando você bate a meta do mês." },
  { id: "niveis", rotulo: "Níveis de faturamento", descricao: "Um aviso para cada marco: R$ 1 mil, 5 mil e 10 mil no mês." },
  { id: "cobranca", rotulo: "Lembrete de cobrança", descricao: "Todo dia às 8h, quem tem parcela vencendo ou atrasada." },
];

export function infoDoEvento(evento: Evento) {
  return EVENTOS.find((e) => e.id === evento)!;
}

// ---------------------------------------------------------------------------
// Modelos: cada um traz um texto para cada evento
// ---------------------------------------------------------------------------

export interface Texto {
  titulo: string;
  corpo: string;
}
export type Textos = Record<Evento, Texto>;

export interface ModeloNotificacao {
  id: string;
  nome: string;
  descricao: string;
  textos: Textos;
}

export const MODELOS: ModeloNotificacao[] = [
  {
    id: "aprovada",
    nome: "Venda aprovada",
    descricao: "Completo: valor, lucro, produto e canal.",
    textos: {
      venda: {
        titulo: "💸 Venda aprovada!",
        corpo: "Valor: {valor}\nLucro: {lucro} ({margem})\nProduto: {produto}\nCanal: {canal}",
      },
      meta: {
        titulo: "🏆 Meta {tipo} batida!",
        corpo: "Você chegou a {atingido} e a meta era {meta}.\nParabéns, {mes} é seu!",
      },
      nivel_1k: {
        titulo: "🚀 Primeiros R$ 1 mil de {mes}!",
        corpo: "Faturamento do mês: {faturamento}\nO primeiro degrau ficou pra trás. Bora subir!",
      },
      nivel_5k: {
        titulo: "🔥 R$ 5 mil no mês!",
        corpo: "Faturamento de {mes}: {faturamento}\nO ritmo está forte. Continue assim!",
      },
      nivel_10k: {
        titulo: "👑 R$ 10 mil no mês!",
        corpo: "Faturamento de {mes}: {faturamento}\nNível elite desbloqueado!",
      },
      cobranca: {
        titulo: "🔔 Hora de cobrar",
        corpo: "{parcelas} para receber: {total}\n{clientes}\n{atraso}",
      },
    },
  },
  {
    id: "lucro",
    nome: "Foco no lucro",
    descricao: "O lucro em destaque, para ver de relance.",
    textos: {
      venda: { titulo: "🤑 +{lucro} de lucro", corpo: "Venda de {valor}\n{itens}\n{cliente}" },
      meta: {
        titulo: "🎯 Meta {tipo} batida!",
        corpo: "Você fechou {atingido} com meta de {meta}.\nMandou muito bem!",
      },
      nivel_1k: {
        titulo: "💰 {faturamento} no mês",
        corpo: "O primeiro milhar já está no bolso.\nCada venda conta!",
      },
      nivel_5k: { titulo: "💰💰 {faturamento} no mês", corpo: "Cinco mil batidos.\nO caixa está sorrindo." },
      nivel_10k: { titulo: "💎 {faturamento} em {mes}", corpo: "Dez mil no caixa!\nEsse mês vai pro histórico." },
      cobranca: {
        titulo: "💵 {total} esperando você",
        corpo: "{parcelas}: {clientes}\n{atraso}\nUm lembrete educado traz esse dinheiro pra casa.",
      },
    },
  },
  {
    id: "comemorar",
    nome: "Bora comemorar",
    descricao: "Animado, com cara de festa.",
    textos: {
      venda: { titulo: "🎉 Vendeu! {valor}", corpo: "{itens}\n{canal}\nBora pra próxima!" },
      meta: {
        titulo: "🥳 META BATIDA!",
        corpo: "Você bateu a meta {tipo}: {atingido}!\nHora de comemorar!",
      },
      nivel_1k: { titulo: "🎈 1 mil no mês!", corpo: "Você abriu {mes} com o pé direito: {faturamento}." },
      nivel_5k: { titulo: "🎊 5 mil no mês!", corpo: "{faturamento} em {mes}.\nSolta o confete!" },
      nivel_10k: { titulo: "🏆 10 MIL!", corpo: "{faturamento} em {mes}.\nIsso merece festa!" },
      cobranca: {
        titulo: "📣 Dia de receber!",
        corpo: "{parcelas} esperando: {total}\n{clientes}\nUma mensagem hoje traz esse dinheiro pra casa.",
      },
    },
  },
  {
    id: "pagamento",
    nome: "Pagamento confirmado",
    descricao: "Sério e direto ao ponto.",
    textos: {
      venda: { titulo: "✅ Pagamento confirmado — {valor}", corpo: "{cliente}\n{forma_pagamento}\n{produto}" },
      meta: { titulo: "✅ Meta {tipo} atingida", corpo: "{atingido} de {meta} em {mes}." },
      nivel_1k: { titulo: "✅ Faturamento passou de R$ 1 mil", corpo: "Total de {mes}: {faturamento}" },
      nivel_5k: { titulo: "✅ Faturamento passou de R$ 5 mil", corpo: "Total de {mes}: {faturamento}" },
      nivel_10k: { titulo: "✅ Faturamento passou de R$ 10 mil", corpo: "Total de {mes}: {faturamento}" },
      cobranca: { titulo: "⏰ Cobranças pendentes", corpo: "{parcelas} — {total}\n{clientes}\n{atraso}" },
    },
  },
  {
    id: "simples",
    nome: "Simples",
    descricao: "Só o essencial, sem enfeite.",
    textos: {
      venda: { titulo: "Nova venda registrada", corpo: "{valor} — {cliente}" },
      meta: { titulo: "Meta {tipo} batida", corpo: "{atingido} (meta {meta})" },
      nivel_1k: { titulo: "Faturamento de R$ 1 mil", corpo: "{faturamento} em {mes}" },
      nivel_5k: { titulo: "Faturamento de R$ 5 mil", corpo: "{faturamento} em {mes}" },
      nivel_10k: { titulo: "Faturamento de R$ 10 mil", corpo: "{faturamento} em {mes}" },
      cobranca: { titulo: "Cobranças pendentes", corpo: "{parcelas}: {total}" },
    },
  },
];

export const MODELO_PADRAO = "aprovada";
export const MODELO_PERSONALIZADO = "personalizado";

// ---------------------------------------------------------------------------
// Valores de cada evento
// ---------------------------------------------------------------------------

export interface DadosVendaNotificacao {
  valor: number;
  lucro: number;
  desconto: number;
  cliente: string | null;
  canal: string | null;
  formaPagamento: string | null;
  itens: { nome: string; quantidade: number }[];
}

export function nomeDoMes(mesISO: string) {
  return new Date(`${mesISO}-01T00:00:00`).toLocaleDateString("pt-BR", { month: "long" });
}

export function valoresDaVenda(d: DadosVendaNotificacao): Record<string, string> {
  const primeiro = d.itens[0];
  const extras = d.itens.length - 1;
  return {
    valor: formatBRL(d.valor),
    lucro: formatBRL(d.lucro),
    margem: d.valor > 0 ? `${((d.lucro / d.valor) * 100).toFixed(0)}%` : "",
    desconto: d.desconto > 0 ? formatBRL(d.desconto) : "",
    produto: primeiro ? `${primeiro.nome}${extras > 0 ? ` +${extras}` : ""}` : "",
    itens: d.itens.map((i) => `${i.quantidade}x ${i.nome}`).join(", "),
    cliente: d.cliente?.trim() ?? "",
    canal: d.canal?.trim() ?? "",
    forma_pagamento: d.formaPagamento?.trim() ?? "",
  };
}

export function valoresDaMeta(d: { tipo: "vendas" | "lucro"; meta: number; atingido: number; mes: string }) {
  return {
    tipo: d.tipo === "vendas" ? "de vendas" : "de lucro",
    meta: formatBRL(d.meta),
    atingido: formatBRL(d.atingido),
    mes: nomeDoMes(d.mes),
  };
}

export function valoresDoNivel(d: { nivel: number; faturamento: number; mes: string }) {
  return { faturamento: formatBRL(d.faturamento), nivel: formatBRL(d.nivel), mes: nomeDoMes(d.mes) };
}

export interface ParcelaParaCobrar {
  cliente: string | null;
  valor: number;
  diasAtraso: number;
}

export function valoresDaCobranca(parcelas: ParcelaParaCobrar[]) {
  const porCliente = new Map<string, number>();
  for (const p of parcelas) {
    const nome = p.cliente?.trim() || "Cliente sem nome";
    porCliente.set(nome, (porCliente.get(nome) ?? 0) + p.valor);
  }
  const ordenados = [...porCliente.entries()].sort((a, b) => b[1] - a[1]).map(([nome]) => nome);
  const resto = ordenados.length - 3;
  const nomes = ordenados.slice(0, 3);
  const clientes =
    resto > 0
      ? `${nomes.join(", ")} e mais ${resto}`
      : nomes.length > 1
        ? `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`
        : (nomes[0] ?? "");
  const maiorAtraso = Math.max(0, ...parcelas.map((p) => p.diasAtraso));
  return {
    parcelas: `${parcelas.length} ${parcelas.length === 1 ? "parcela" : "parcelas"}`,
    total: formatBRL(parcelas.reduce((s, p) => s + p.valor, 0)),
    clientes,
    cliente: ordenados[0] ?? "",
    atraso: maiorAtraso > 0 ? `${maiorAtraso} ${maiorAtraso === 1 ? "dia" : "dias"} de atraso` : "",
  };
}

// ---------------------------------------------------------------------------
// Renderização
// ---------------------------------------------------------------------------

const VARIAVEL_RE = /\{(\w+)\}/g;

// Linha do corpo que usa uma variável sem valor (ex.: venda sem cliente) some
// em vez de aparecer vazia ou com sobra de separador.
export function renderizar(titulo: string, corpo: string, valores: Record<string, string>) {
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
    titulo: trocar(titulo).replace(/\s+/g, " ").trim() || "Marcon",
    corpo: linhas.join("\n"),
  };
}

// ---------------------------------------------------------------------------
// Preferências do usuário (guardadas em user_metadata)
// ---------------------------------------------------------------------------

export type TextosPersonalizados = Partial<Record<Evento, Texto>>;

export interface PreferenciaNotificacao {
  modelo: string;
  personalizados: TextosPersonalizados;
  desativados: Grupo[];
}

const IDS_EVENTO = EVENTOS.map((e) => e.id);
const IDS_GRUPO = GRUPOS.map((g) => g.id);

// \r\n vem dos textareas no envio do formulário; espaços nas pontas não contam
export function normalizarTexto(valor: string) {
  return valor.replace(/\r\n?/g, "\n").trim();
}

export function lerPreferencias(meta: Record<string, unknown> | undefined): PreferenciaNotificacao {
  const bruto = typeof meta?.notif_modelo === "string" ? meta.notif_modelo : MODELO_PADRAO;
  const modelo = bruto === MODELO_PERSONALIZADO || MODELOS.some((m) => m.id === bruto) ? bruto : MODELO_PADRAO;

  const personalizados: TextosPersonalizados = {};
  const salvo = meta?.notif_custom;
  if (salvo && typeof salvo === "object") {
    for (const id of IDS_EVENTO) {
      const t = (salvo as Record<string, unknown>)[id] as Partial<Texto> | undefined;
      if (t && typeof t.titulo === "string" && t.titulo.trim()) {
        personalizados[id] = { titulo: t.titulo, corpo: typeof t.corpo === "string" ? t.corpo : "" };
      }
    }
  } else if (typeof meta?.notif_titulo === "string" && meta.notif_titulo.trim()) {
    // formato antigo: só o texto da venda
    personalizados.venda = { titulo: meta.notif_titulo, corpo: typeof meta.notif_corpo === "string" ? meta.notif_corpo : "" };
  }

  const desativados = Array.isArray(meta?.notif_desativados)
    ? (meta.notif_desativados as unknown[]).filter((g): g is Grupo => IDS_GRUPO.includes(g as Grupo))
    : [];

  return { modelo, personalizados, desativados };
}

export function textoDoEvento(pref: PreferenciaNotificacao, evento: Evento): Texto {
  if (pref.modelo === MODELO_PERSONALIZADO && pref.personalizados[evento]) return pref.personalizados[evento]!;
  const base = MODELOS.find((m) => m.id === pref.modelo) ?? MODELOS[0];
  return base.textos[evento];
}

export function eventoAtivo(pref: PreferenciaNotificacao, evento: Evento) {
  return !pref.desativados.includes(infoDoEvento(evento).grupo);
}
