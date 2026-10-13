import { formatBRL } from "@/lib/format";

// As notificações não têm texto fixo nem escolhido pelo usuário: cada evento tem
// várias frases descontraídas, em rotação embaralhada que não repete a anterior. O usuário só
// decide o que receber e quais dados aparecem.

export type Evento =
  | "venda"
  | "pedido"
  | "estoque_baixo"
  | "estoque_zerado"
  | "meta"
  | "nivel_1k"
  | "nivel_5k"
  | "nivel_10k"
  | "cobranca"
  | "resumo";

// O que o usuário liga/desliga (os três níveis de faturamento andam juntos, e os dois avisos de estoque também)
export type Grupo = "venda" | "pedido" | "estoque" | "meta" | "niveis" | "cobranca" | "resumo";

export const NIVEIS: { evento: Evento; valor: number }[] = [
  { evento: "nivel_1k", valor: 1000 },
  { evento: "nivel_5k", valor: 5000 },
  { evento: "nivel_10k", valor: 10000 },
];

export const EVENTOS: Evento[] = [
  "venda",
  "pedido",
  "estoque_baixo",
  "estoque_zerado",
  "meta",
  "nivel_1k",
  "nivel_5k",
  "nivel_10k",
  "cobranca",
  "resumo",
];

const GRUPO_DO_EVENTO: Record<Evento, Grupo> = {
  venda: "venda",
  pedido: "pedido",
  estoque_baixo: "estoque",
  estoque_zerado: "estoque",
  meta: "meta",
  nivel_1k: "niveis",
  nivel_5k: "niveis",
  nivel_10k: "niveis",
  cobranca: "cobranca",
  resumo: "resumo",
};

export const GRUPOS: { id: Grupo; rotulo: string; descricao: string }[] = [
  { id: "venda", rotulo: "Vendas", descricao: "Um aviso a cada venda registrada." },
  { id: "pedido", rotulo: "Pedidos da vitrine", descricao: "Na hora em que um cliente manda um pedido pela sua loja." },
  { id: "estoque", rotulo: "Estoque acabando", descricao: "Quando uma venda deixa um produto no limite que você definiu ou zerado." },
  { id: "meta", rotulo: "Meta batida", descricao: "Comemora quando você bate a meta do mês." },
  { id: "niveis", rotulo: "Marcos de faturamento", descricao: "Quando o mês passa de R$ 1 mil, R$ 5 mil e R$ 10 mil." },
  { id: "cobranca", rotulo: "Lembrete de cobrança", descricao: "Todo dia às 8h, se houver parcela vencendo ou atrasada." },
  { id: "resumo", rotulo: "Resumo do dia", descricao: "Por volta das 20h, só nos dias em que você vendeu." },
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
    { titulo: "Fechou negócio 🤝" },
    { titulo: "Mais um pra lista de entregas 📦" },
    { titulo: "Dinheiro no bolso 😎" },
    { titulo: "Tá vendendo, hein? 👏" },
    { titulo: "Mais uma saiu! 🚀" },
    { titulo: "Pix na área 📲" },
    { titulo: "Bora embalar! 🎁" },
    { titulo: "O estoque diminuiu e o caixa cresceu 📈" },
    { titulo: "Negócio fechado ✅" },
    { titulo: "Mais um cliente atendido 🙌" },
    { titulo: "Isso aí, campeão! 🏅" },
    { titulo: "Tá rendendo hoje 🔥" },
    { titulo: "Venda feita, próxima! 💪" },
    { titulo: "Alguém aí tá bombando 😏" },
    { titulo: "Mais uma no histórico 📒" },
    { titulo: "Dia bom pra vender 🌟" },
    { titulo: "Entrou mais uma! 🎯" },
    { titulo: "Quem diria, hein? Vendeu 😄" },
    { titulo: "Missão de hoje: vender. Cumprida ✔️" },
    { titulo: "Olha o dinheirinho entrando 🤑" },
    { titulo: "Seguiu o fluxo: vendeu! 🌊" },
    { titulo: "Mais um pedido pra conta 🧾" },
  ],
  pedido: [
    { titulo: "Pedido novo na vitrine! 🛍️" },
    { titulo: "Chegou pedido 👀" },
    { titulo: "Tem cliente querendo comprar 🙋" },
    { titulo: "A vitrine trabalhou por você 😎" },
    { titulo: "Olha o pedido aí! 📬" },
    { titulo: "Pedido fresquinho 🔔" },
    { titulo: "Alguém encheu o carrinho 🛒" },
    { titulo: "Sua loja recebeu um pedido 🏪" },
    { titulo: "Corre lá no Zap, tem pedido 📲" },
    { titulo: "Mais um pedido chegando 🙌" },
    { titulo: "Pediram pela vitrine! 🎉" },
    { titulo: "Cliente na porta 🚪" },
    { titulo: "Pedido novo, bora responder 💬" },
    { titulo: "A vitrine não para 🔥" },
    { titulo: "Tem carrinho fechado te esperando 🧾" },
    { titulo: "Pedido na área ⚡" },
  ],
  estoque_baixo: [
    { titulo: "Tá acabando! ⏳" },
    { titulo: "Estoque no finalzinho 👀" },
    { titulo: "Hora de repor 📦" },
    { titulo: "Vendeu tanto que tá acabando 🔥" },
    { titulo: "Últimas unidades 🚨" },
    { titulo: "Bora falar com o fornecedor? 📞" },
    { titulo: "Estoque pedindo reforço 💪" },
    { titulo: "Quase no fim 📉" },
    { titulo: "Olho no estoque 👁️" },
    { titulo: "Restam poucos ⚠️" },
    { titulo: "Sucesso de vendas, estoque curto 😅" },
    { titulo: "Repor antes que acabe 🛒" },
  ],
  estoque_zerado: [
    { titulo: "Acabou! 🚫" },
    { titulo: "Estoque zerado 📭" },
    { titulo: "Vendeu tudo! 🎉" },
    { titulo: "Esse esgotou 🔥" },
    { titulo: "Prateleira vazia 🕳️" },
    { titulo: "Zerou o estoque 😮" },
    { titulo: "Não sobrou nenhum 👏" },
    { titulo: "Esgotado! Hora de repor 📦" },
    { titulo: "Foi o último 🏁" },
    { titulo: "Saiu a última unidade 👋" },
    { titulo: "Acabou, e isso é bom sinal 😎" },
    { titulo: "Sem estoque por aqui ⚠️" },
  ],
  meta: [
    { titulo: "Meta batida! 🎯", corpo: "Missão cumprida." },
    { titulo: "Meta no bolso 🏆" },
    { titulo: "Bateu a meta! 🥳" },
    { titulo: "Meta fechada, pode comemorar 🎉" },
    { titulo: "Objetivo do mês: concluído ✅" },
    { titulo: "Chegou lá! 🚀", corpo: "A meta ficou pra trás." },
    { titulo: "Era só uma meta, né? 😎" },
    { titulo: "Meta cumprida, parabéns! 👏" },
    { titulo: "Você passou da meta 🔥" },
    { titulo: "Mais uma meta no currículo 📋" },
    { titulo: "Meta alcançada, e agora? 😏" },
    { titulo: "Deu certo! Meta batida 🙌" },
    { titulo: "Planejou, vendeu, bateu 💪" },
    { titulo: "Meta no papel e no bolso 💰" },
  ],
  nivel_1k: [
    { titulo: "Primeiro milhar do mês 🚀" },
    { titulo: "R$ 1 mil no caixa! 💰" },
    { titulo: "Já passou de mil! 🙌" },
    { titulo: "O mês começou bem 😎" },
    { titulo: "Mil reais e contando 🔥" },
    { titulo: "Aquecimento concluído 💪" },
    { titulo: "Mil reais vendidos! 🎉" },
    { titulo: "Passou de mil, bora pra mais 📈" },
    { titulo: "Primeiro mil do mês no bolso 🤑" },
    { titulo: "O mês já tem cara de bom 👀" },
    { titulo: "Mil na conta, segue o jogo ⚡" },
    { titulo: "Mil batidos, tá voando 🛫" },
  ],
  nivel_5k: [
    { titulo: "Cinco mil, sem freio 🔥" },
    { titulo: "R$ 5 mil no mês! 🎊" },
    { titulo: "O ritmo tá forte 💪" },
    { titulo: "Cinco mil batidos 🙌" },
    { titulo: "Isso já é mês bom 😎" },
    { titulo: "Subindo de nível ⭐" },
    { titulo: "Cinco mil e o mês nem acabou 👀" },
    { titulo: "Mês forte, hein? 5 mil vendidos 📈" },
    { titulo: "5 mil! Respira e continua 😮‍💨" },
    { titulo: "Meio caminho dos 10 mil 🚀" },
    { titulo: "Faturamento de gente grande 🏆" },
    { titulo: "Cinco mil no mês, parabéns! 🥳" },
  ],
  nivel_10k: [
    { titulo: "Dez mil! Respira e comemora 👑" },
    { titulo: "R$ 10 mil no mês! 🏆" },
    { titulo: "Nível lendário desbloqueado ✨" },
    { titulo: "Dez mil batidos, que fase! 🚀" },
    { titulo: "Mês histórico 🥳" },
    { titulo: "Faturamento de respeito 👏" },
    { titulo: "Dez mil! Pode comemorar 🍾" },
    { titulo: "Isso aqui já é empresa 🏢" },
    { titulo: "Cinco dígitos no mês 🔥" },
    { titulo: "Mês de campeão 🥇" },
    { titulo: "Dez mil, e agora mira nos 20 😏" },
    { titulo: "Tá no topo do mês! 🏔️" },
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
    { titulo: "Tem parcela esperando você 📬" },
    { titulo: "Que tal um oi no WhatsApp? 💬" },
    { titulo: "Dinheiro parado, hora de buscar 🏃" },
    { titulo: "Cobrar faz parte do negócio 🤝" },
    { titulo: "Lembrete do dia: receber 📌" },
    { titulo: "Uma conversa rápida resolve 😄" },
    { titulo: "Contas a receber chamando 📞" },
    { titulo: "Seu dinheiro quer voltar pra casa 🏠" },
  ],
  resumo: [
    { titulo: "Fechou o dia! 🌙" },
    { titulo: "Resumo de hoje 📊" },
    { titulo: "Como foi o seu dia 👇" },
    { titulo: "Dia encerrado, olha só 👀" },
    { titulo: "O placar de hoje 🏆" },
    { titulo: "Hora de ver o resultado 💰" },
    { titulo: "Seu dia em números 🔢" },
    { titulo: "Balanço do dia ⚖️" },
    { titulo: "Mais um dia de vendas 🙌" },
    { titulo: "Fim de expediente 🌆" },
    { titulo: "Hoje rendeu! 📈" },
    { titulo: "O dia passou e deixou isso 💸" },
    { titulo: "Boa noite, olha o seu dia 😴" },
    { titulo: "Caixa do dia fechado ✅" },
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

// gerador determinístico (mulberry32): a mesma semente dá sempre a mesma ordem
function sorteador(semente: number) {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ordem das frases em cada rodada: embaralhada por usuário, por evento e por rodada
function ordemDaRodada(tamanho: number, rodada: number, chave: string, evento: Evento) {
  const ordem = Array.from({ length: tamanho }, (_, i) => i);
  const sorteio = sorteador(hashTexto(`${chave}|${evento}|${rodada}`));
  for (let i = tamanho - 1; i > 0; i--) {
    const j = Math.floor(sorteio() * (i + 1));
    [ordem[i], ordem[j]] = [ordem[j], ordem[i]];
  }
  return ordem;
}

// Escolha estável e sem repetir. A posição (quantas vezes esse aviso já saiu, por exemplo
// o total de vendas) percorre as frases rodada a rodada: dentro de uma rodada nenhuma
// frase se repete, a ordem muda a cada rodada e por usuário (chave), e a primeira de
// uma rodada nunca é a última da anterior. Não guarda estado em lugar nenhum.
export function escolherVariante(evento: Evento, posicao: number, chave = ""): Variante {
  const lista = VARIANTES[evento];
  const n = lista.length;
  const p = Math.max(0, Math.trunc(posicao));
  const rodada = Math.floor(p / n);
  const ordem = ordemDaRodada(n, rodada, chave, evento);
  if (rodada > 0 && n > 1) {
    const anterior = ordemDaRodada(n, rodada - 1, chave, evento);
    if (ordem[0] === anterior[n - 1]) [ordem[0], ordem[1]] = [ordem[1], ordem[0]];
  }
  return lista[ordem[p % n]];
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

export interface DadosPedidoNotificacao {
  total: number;
  cliente: string | null;
  itens: { nome: string; quantidade: number }[];
}

// produto (ou variação) que uma venda deixou no limite ou zerado
export interface ItemDeEstoque {
  nome: string;
  restam: number;
}

export interface DadosResumoNotificacao {
  vendas: number;
  valor: number;
  lucro: number;
  parcelasAmanha: number;
  valorParcelasAmanha: number;
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

export function linhaDoPedido(d: DadosPedidoNotificacao) {
  const primeiro = d.itens[0];
  const extras = d.itens.length - 1;
  const partes: (string | null)[] = [
    primeiro ? `${primeiro.nome}${extras > 0 ? ` +${extras}` : ""}` : null,
    formatBRL(d.total),
    d.cliente?.trim() || null,
  ];
  return partes.filter(Boolean).join(" · ");
}

// até 3 produtos, um por linha; o resto vira "e mais N"
export function linhaDoEstoqueBaixo(itens: ItemDeEstoque[]) {
  const linhas = itens.slice(0, 3).map((i) => `${i.nome}: ${i.restam === 1 ? "resta 1" : `restam ${i.restam}`}`);
  const resto = itens.length - linhas.length;
  return (resto > 0 ? [...linhas, `e mais ${resto}`] : linhas).join("\n");
}

export function linhaDoEstoqueZerado(itens: ItemDeEstoque[]) {
  const nomes = itens.slice(0, 3).map((i) => i.nome);
  const resto = itens.length - nomes.length;
  return resto > 0 ? `${nomes.join(", ")} e mais ${resto}` : nomes.join(", ");
}

// O resumo segue o que o vendedor escolheu para o aviso de venda (valor e lucro) e para o
// lembrete de cobrança (valor total): o que ele escondeu lá não aparece aqui.
export function linhaDoResumo(d: DadosResumoNotificacao, dados: DadosPreferidos) {
  const primeira = [
    `${d.vendas} ${d.vendas === 1 ? "venda" : "vendas"}`,
    dados.venda.valor ? formatBRL(d.valor) : null,
    dados.venda.lucro ? `lucro ${formatBRL(d.lucro)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  if (d.parcelasAmanha <= 0) return primeira;
  const parcelas = `${d.parcelasAmanha} ${d.parcelasAmanha === 1 ? "parcela vence" : "parcelas vencem"} amanhã`;
  return `${primeira}\n${dados.cobranca.total ? `${parcelas} · ${formatBRL(d.valorParcelasAmanha)}` : parcelas}`;
}

// ---------------------------------------------------------------------------
// Montagem
// ---------------------------------------------------------------------------

export function montarNotificacao(evento: Evento, posicao: number, linhaDeDados: string, chave = "") {
  const v = escolherVariante(evento, posicao, chave);
  return { titulo: v.titulo, corpo: [v.corpo, linhaDeDados].filter(Boolean).join("\n") };
}

// Exemplo com dados fictícios, respeitando o que o usuário escolheu mostrar
export function montarExemplo(pref: Preferencias, evento: Evento, posicao: number) {
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
  const linha = (() => {
    switch (evento) {
      case "venda":
        return linhaDaVenda(venda, pref.dados.venda);
      case "pedido":
        return linhaDoPedido({ total: venda.valor, cliente: venda.cliente, itens: venda.itens });
      case "estoque_baixo":
        return linhaDoEstoqueBaixo([{ nome: "Tênis Casual", restam: 2 }]);
      case "estoque_zerado":
        return linhaDoEstoqueZerado([{ nome: "Meia Esportiva", restam: 0 }]);
      case "meta":
        return linhaDaMeta("vendas", 10120);
      case "cobranca":
        return linhaDaCobranca(parcelas, pref.dados.cobranca);
      case "resumo":
        return linhaDoResumo({ vendas: 6, valor: 540, lucro: 210, parcelasAmanha: 2, valorParcelasAmanha: 450 }, pref.dados);
      default:
        return linhaDoNivel(NIVEIS.find((n) => n.evento === evento)!.valor + 230.5, "2026-09");
    }
  })();
  return montarNotificacao(evento, posicao, linha);
}
