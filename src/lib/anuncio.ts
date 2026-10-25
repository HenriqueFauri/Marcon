import type { ProdutoVariacao } from "@/types/domain";

// Um padrão só, que serve em qualquer plataforma (Marketplace, OLX, Mercado Livre, Shopee,
// Instagram, WhatsApp): título curto, descrição em texto simples, sem emoji, sem link e sem preço
// no texto (o preço tem campo próprio em todas).
export const LIMITE_TITULO = 120;
export const LIMITE_DESCRICAO = 2000;

function normalizar(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
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

export const TOTAL_ESTILOS = 3;

// junta as partes do título enquanto couber no limite
function montarTitulo(partes: string[]) {
  let titulo = partes[0] ?? "";
  for (const parte of partes.slice(1)) {
    if (!parte) continue;
    const candidato = `${titulo} - ${parte}`;
    if (candidato.length <= LIMITE_TITULO) titulo = candidato;
  }
  return cortar(titulo, LIMITE_TITULO);
}

// Sugestão de título e descrição a partir do cadastro: só monta o texto, o usuário revisa e ajusta
// antes de salvar ou copiar. `estilo` varia a redação (0 a 2) para dar outra versão do mesmo anúncio.
// `estado` é o rótulo da condição escolhida (ex.: "Novo, na caixa"); sem ele, o texto não diz nada.
export function gerarAnuncio(dados: DadosAnuncio, opcoes: { estilo?: number; estado?: string | null } = {}) {
  const estilo = (((opcoes.estilo ?? 0) % TOTAL_ESTILOS) + TOTAL_ESTILOS) % TOTAL_ESTILOS;

  const nomeJaTemMarca = dados.marca ? normalizar(dados.nome).includes(normalizar(dados.marca)) : true;
  const base = [dados.nome, nomeJaTemMarca ? null : dados.marca].filter(Boolean).join(" ");

  // atributos agrupados (ex.: Tamanho: P, M, G)
  const atributos = new Map<string, Set<string>>();
  for (const v of dados.variacoes) {
    for (const [chave, valor] of Object.entries(v.atributos ?? {})) {
      if (!valor) continue;
      if (!atributos.has(chave)) atributos.set(chave, new Set());
      atributos.get(chave)!.add(valor);
    }
  }
  const variacoesTexto = [...atributos.entries()].map(([chave, valores]) => `${chave}: ${[...valores].join(", ")}`);
  const opcoesTitulo = [...atributos.values()].map((valores) => [...valores].join("/")).filter(Boolean).join(" ");

  const categoriaNoTitulo =
    dados.categoria && !normalizar(base).includes(normalizar(dados.categoria)) ? dados.categoria : "";
  const titulo = montarTitulo([base, ...[[opcoesTitulo], [categoriaNoTitulo, opcoesTitulo], [opcoesTitulo, categoriaNoTitulo]][estilo]]);

  const detalhes = [
    dados.marca ? `Marca: ${dados.marca}` : null,
    dados.categoria ? `Categoria: ${dados.categoria}` : null,
    ...variacoesTexto,
    opcoes.estado ? `Estado: ${opcoes.estado}` : null,
  ].filter(Boolean) as string[];
  const marcadores = detalhes.map((d) => `• ${d}`);
  const textoCadastro = dados.descricao?.trim() ?? "";

  const corpos: string[][] = [
    // completo
    [base, "", ...(textoCadastro ? [textoCadastro, ""] : []), ...(marcadores.length ? [...marcadores, ""] : []), "Chame para combinar entrega ou retirada."],
    // detalhes antes do texto
    [base, "", ...(marcadores.length ? ["Detalhes do produto:", ...marcadores, ""] : []), ...(textoCadastro ? [textoCadastro, ""] : []), "Tem dúvida? Me chame que respondo rápido."],
    // curto
    [base, ...(textoCadastro ? ["", textoCadastro.split("\n")[0]] : []), "", ...(detalhes.length ? [detalhes.join(" · "), ""] : []), "Chame para combinar entrega ou retirada."],
  ];

  const descricao = cortar(corpos[estilo].join("\n").trim(), LIMITE_DESCRICAO);
  return { titulo, descricao };
}
