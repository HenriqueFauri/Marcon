// Respostas prontas (migration 0073): variáveis, atalho e exemplos. Arquivo puro, sem import, usado
// pelo app (tela e prévia) e pela extensão do WhatsApp Web (extensao/ importa este arquivo direto).
// Testes em extensao/teste/respostas.test.ts.
//
// Variáveis: {negocio}, {pix}, {endereco}, {telefone}, {vitrine}. Preenchidas só com dado que a conta
// já tem (Configurações e Vitrine), nunca com dado da conversa. A linha que usa uma variável sem
// valor sai inteira do texto, para não sobrar "Chave Pix:" solto nem chave vazia.

export const LIMITE_TITULO = 60;
export const LIMITE_TEXTO = 2000;
export const LIMITE_ATALHO = 20;
export const LIMITE_RESPOSTAS = 200;

export const VARIAVEIS = [
  { chave: "negocio", rotulo: "Nome do negócio" },
  { chave: "pix", rotulo: "Chave Pix" },
  { chave: "endereco", rotulo: "Endereço" },
  { chave: "telefone", rotulo: "Telefone" },
  { chave: "vitrine", rotulo: "Link da vitrine" },
] as const;

export type ChaveVariavel = (typeof VARIAVEIS)[number]["chave"];
export type DadosDaConta = Partial<Record<ChaveVariavel, string | null | undefined>>;

// nomes que o dono pode escrever de outro jeito ({Negócio}, {loja}, {chave pix}, {link})
const APELIDOS: Record<string, ChaveVariavel> = {
  negocio: "negocio",
  loja: "negocio",
  nomedonegocio: "negocio",
  pix: "pix",
  chavepix: "pix",
  endereco: "endereco",
  telefone: "telefone",
  vitrine: "vitrine",
  link: "vitrine",
  linkdavitrine: "vitrine",
};

function semAcento(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// chave da variável escrita entre chaves, ou null se não é uma das nossas
export function chaveDaVariavel(nome: string): ChaveVariavel | null {
  const limpo = semAcento(nome).toLowerCase().replace(/[\s_]+/g, "");
  return APELIDOS[limpo] ?? null;
}

const TOKEN = /\{\s*([^{}\n]{1,30}?)\s*\}/g;

// variáveis conhecidas que o texto usa, na ordem em que aparecem (sem repetir)
export function variaveisUsadas(texto: string): ChaveVariavel[] {
  const vistas: ChaveVariavel[] = [];
  for (const m of texto.matchAll(TOKEN)) {
    const c = chaveDaVariavel(m[1]);
    if (c && !vistas.includes(c)) vistas.push(c);
  }
  return vistas;
}

// variáveis que o texto usa e a conta não tem: a tela avisa que a linha vai sumir
export function variaveisSemValor(texto: string, dados: DadosDaConta): ChaveVariavel[] {
  return variaveisUsadas(texto).filter((c) => !valor(dados, c));
}

function valor(dados: DadosDaConta, c: ChaveVariavel): string {
  // uma linha só: endereço com quebra vira vírgula, para não bagunçar o texto
  return String(dados[c] ?? "")
    .split(/\r?\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .join(", ");
}

export function preencherVariaveis(texto: string, dados: DadosDaConta): string {
  const linhas: string[] = [];
  for (const linha of texto.replace(/\r\n?/g, "\n").split("\n")) {
    let faltou = false;
    const nova = linha.replace(TOKEN, (inteiro, nome: string) => {
      const c = chaveDaVariavel(nome);
      if (!c) return inteiro; // chave desconhecida fica como o dono escreveu
      const v = valor(dados, c);
      if (!v) faltou = true;
      return v;
    });
    if (!faltou) linhas.push(nova.trimEnd());
  }
  // sem linha em branco sobrando no começo, no fim ou dobrada no meio
  return linhas
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// atalho: minúsculas e números, sem acento, sem a barra que o dono costuma digitar ("/pix")
export function normalizarAtalho(bruto: string): string {
  return semAcento(bruto).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, LIMITE_ATALHO);
}

export interface RespostaPronta {
  id: string;
  titulo: string;
  texto: string;
  atalho: string | null;
  ordem: number;
}

// busca por título, texto e atalho. "/pix" ou "pix" acha o atalho primeiro.
export function filtrarRespostas<T extends Pick<RespostaPronta, "titulo" | "texto" | "atalho">>(lista: T[], termo: string): T[] {
  const busca = semAcento(termo).toLowerCase().trim();
  if (!busca) return lista;
  const atalho = normalizarAtalho(busca);
  const palavras = busca.replace(/^\//, "").split(/\s+/).filter(Boolean);
  const nota = (r: T) => {
    if (atalho && r.atalho === atalho) return 3;
    if (atalho && r.atalho?.startsWith(atalho)) return 2;
    const tudo = semAcento(`${r.titulo}\n${r.texto}\n${r.atalho ?? ""}`).toLowerCase();
    return palavras.every((p) => tudo.includes(p)) ? 1 : 0;
  };
  return lista
    .map((r, i) => ({ r, i, n: nota(r) }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n || a.i - b.i)
    .map((x) => x.r);
}

// Exemplos do estado vazio: o dono cria todos de uma vez e edita como quiser.
export const EXEMPLOS: { titulo: string; atalho: string; texto: string }[] = [
  { titulo: "Saudação", atalho: "oi", texto: "Oi! Aqui é da {negocio}, tudo bem?\nComo posso te ajudar?" },
  {
    titulo: "Retirada",
    atalho: "retirada",
    texto: "Dá pra retirar aqui com a gente, sem custo.\nEndereço: {endereco}\nMe avisa o dia e o horário que fica melhor pra você.",
  },
  {
    titulo: "Entrega",
    atalho: "entrega",
    texto: "Fazemos entrega, sim! Me passa seu endereço com CEP que eu te falo o valor e o prazo.",
  },
  {
    titulo: "Formas de pagamento",
    atalho: "pagamento",
    texto: "Aceitamos Pix, dinheiro e cartão. Qual fica melhor pra você?",
  },
  {
    titulo: "Pix",
    atalho: "pix",
    texto: "Pode pagar no Pix.\nChave: {pix}\nAssim que pagar, me manda o comprovante por aqui, por favor.",
  },
  {
    titulo: "Ainda disponível",
    atalho: "disponivel",
    texto: "Tá disponível, sim! Quer que eu separe pra você?\nVeja mais coisas na loja: {vitrine}",
  },
  {
    titulo: "Agradecimento",
    atalho: "obrigado",
    texto: "Muito obrigado pela compra! Qualquer coisa, é só chamar aqui.\n{negocio}",
  },
];
