import { formatBRL } from "@/lib/format";
import type { ProdutoVariacao } from "@/types/domain";

export interface LimitesCanal {
  titulo: number | null;
  descricao: number | null;
}

function normalizar(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

// limites conhecidos por plataforma; canal desconhecido = sem limite
export function limitesDoCanal(nomeCanal: string): LimitesCanal {
  const n = normalizar(nomeCanal);
  if (n.includes("mercado")) return { titulo: 60, descricao: null };
  if (n.includes("shopee")) return { titulo: 120, descricao: 3000 };
  if (n.includes("facebook") || n.includes("marketplace")) return { titulo: 100, descricao: 5000 };
  if (n.includes("olx")) return { titulo: 90, descricao: 6000 };
  if (n.includes("instagram")) return { titulo: null, descricao: 2200 };
  return { titulo: null, descricao: null };
}

export function cortar(texto: string, max: number | null) {
  if (max === null || texto.length <= max) return texto;
  // corta em palavra inteira
  const corte = texto.slice(0, max);
  const ultimoEspaco = corte.lastIndexOf(" ");
  return (ultimoEspaco > max * 0.6 ? corte.slice(0, ultimoEspaco) : corte).trim();
}

export interface DadosAnuncio {
  nome: string;
  marca: string | null;
  descricao: string | null;
  categoria: string | null;
  precoVarejo: number;
  unidade: string;
  variacoes: ProdutoVariacao[];
}

export const TOTAL_ESTILOS = 4;

// junta as partes do título enquanto couber no limite do canal
function montarTitulo(partes: string[], limite: number | null) {
  const max = limite ?? 100;
  let titulo = partes[0] ?? "";
  for (const parte of partes.slice(1)) {
    if (!parte) continue;
    const candidato = `${titulo} - ${parte}`;
    if (candidato.length <= max) titulo = candidato;
  }
  return cortar(titulo, limite);
}

// Sugestão de título e descrição a partir do cadastro — só monta o texto, o
// usuário revisa e ajusta antes de salvar/copiar. `estilo` varia a redação
// (0 a 3) pra dar versões diferentes do mesmo anúncio; `variacao`
// foca o texto numa variação específica.
export function gerarAnuncio(
  dados: DadosAnuncio,
  nomeCanal: string,
  opcoes: { estilo?: number; variacao?: ProdutoVariacao | null } = {},
) {
  const limites = limitesDoCanal(nomeCanal);
  const estilo = (((opcoes.estilo ?? 0) % TOTAL_ESTILOS) + TOTAL_ESTILOS) % TOTAL_ESTILOS;
  const variacao = opcoes.variacao ?? null;

  const nomeJaTemMarca = dados.marca ? normalizar(dados.nome).includes(normalizar(dados.marca)) : true;
  const base = [dados.nome, nomeJaTemMarca ? null : dados.marca].filter(Boolean).join(" ");

  // atributos agrupados (ex.: Tamanho: P, M, G); com variação, só os dela
  const atributos = new Map<string, Set<string>>();
  for (const v of variacao ? [variacao] : dados.variacoes) {
    for (const [chave, valor] of Object.entries(v.atributos ?? {})) {
      if (!valor) continue;
      if (!atributos.has(chave)) atributos.set(chave, new Set());
      atributos.get(chave)!.add(valor);
    }
  }
  const variacoesTexto = [...atributos.entries()].map(([chave, valores]) => `${chave}: ${[...valores].join(", ")}`);
  let opcoesTitulo = [...atributos.values()].map((valores) => [...valores].join("/")).filter(Boolean).join(" ");
  if (variacao && !opcoesTitulo) opcoesTitulo = variacao.nome_combinacao;

  const categoriaNoTitulo =
    dados.categoria && !normalizar(base).includes(normalizar(dados.categoria)) ? dados.categoria : "";
  const titulo = montarTitulo(
    [
      base,
      ...[
        [opcoesTitulo],
        [opcoesTitulo, "Pronta Entrega"],
        [categoriaNoTitulo, opcoesTitulo],
        ["Envio Rápido", opcoesTitulo],
      ][estilo],
    ],
    limites.titulo,
  );

  const precos = variacao
    ? [Number(variacao.preco_venda ?? dados.precoVarejo)]
    : dados.variacoes.map((v) => Number(v.preco_venda ?? dados.precoVarejo));
  const menor = precos.length ? Math.min(...precos) : dados.precoVarejo;
  const maior = precos.length ? Math.max(...precos) : dados.precoVarejo;
  const preco = menor === maior ? formatBRL(menor) : `a partir de ${formatBRL(menor)}`;

  const detalhes = [
    dados.marca ? `Marca: ${dados.marca}` : null,
    dados.categoria ? `Categoria: ${dados.categoria}` : null,
    ...variacoesTexto,
  ].filter(Boolean) as string[];
  const marcadores = detalhes.map((d) => `• ${d}`);
  const textoCadastro = dados.descricao?.trim() ?? "";

  const corpos: string[][] = [
    // completo
    [base, "", ...(textoCadastro ? [textoCadastro, ""] : []), ...(marcadores.length ? [...marcadores, ""] : []),
      `Preço: ${preco}`, "Produto novo, pronto para envio.", "Chame no privado para combinar entrega ou retirada."],
    // direto: preço e disponibilidade primeiro
    [`${base} por ${preco}`, "Pronta entrega.", "", ...(textoCadastro ? [textoCadastro, ""] : []), ...marcadores,
      ...(marcadores.length ? [""] : []), "Tem dúvida? Me chame que respondo rápido."],
    // detalhes antes do texto
    [base, "", ...(marcadores.length ? ["Detalhes do produto:", ...marcadores, ""] : []),
      ...(textoCadastro ? [textoCadastro, ""] : []), `Por apenas ${preco}.`, "Envio para todo o Brasil ou retirada combinada."],
    // curto
    [base, ...(textoCadastro ? ["", textoCadastro.split("\n")[0]] : []), "", ...(detalhes.length ? [detalhes.join(" · "), ""] : []),
      `Valor: ${preco}`, "Produto novo. Pronto para envio."],
  ];

  const descricao = cortar(corpos[estilo].join("\n").trim(), limites.descricao);
  return { titulo, descricao };
}
