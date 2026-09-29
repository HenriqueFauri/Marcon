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

function cortar(texto: string, max: number | null) {
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

// Sugestão de título e descrição a partir do cadastro — só monta o texto, o
// usuário revisa e ajusta antes de salvar/copiar.
export function gerarAnuncio(dados: DadosAnuncio, nomeCanal: string) {
  const limites = limitesDoCanal(nomeCanal);

  const nomeJaTemMarca = dados.marca ? normalizar(dados.nome).includes(normalizar(dados.marca)) : true;
  const base = [dados.nome, nomeJaTemMarca ? null : dados.marca].filter(Boolean).join(" ");

  // atributos das variações agrupados (ex.: Tamanho: P, M, G)
  const atributos = new Map<string, Set<string>>();
  for (const v of dados.variacoes) {
    for (const [chave, valor] of Object.entries(v.atributos ?? {})) {
      if (!valor) continue;
      if (!atributos.has(chave)) atributos.set(chave, new Set());
      atributos.get(chave)!.add(valor);
    }
  }
  const variacoesTexto = [...atributos.entries()].map(([chave, valores]) => `${chave}: ${[...valores].join(", ")}`);

  // título: nome + marca, e acrescenta as opções enquanto couber no limite
  let titulo = base;
  const opcoes = [...atributos.values()].map((valores) => [...valores].join("/")).filter(Boolean);
  for (const opcao of opcoes) {
    const candidato = `${titulo} - ${opcao}`;
    if (limites.titulo === null ? candidato.length <= 100 : candidato.length <= limites.titulo) titulo = candidato;
  }
  titulo = cortar(titulo, limites.titulo);

  const precos = dados.variacoes.map((v) => Number(v.preco_venda ?? dados.precoVarejo));
  const menor = precos.length ? Math.min(...precos) : dados.precoVarejo;
  const maior = precos.length ? Math.max(...precos) : dados.precoVarejo;
  const preco = menor === maior ? formatBRL(menor) : `a partir de ${formatBRL(menor)}`;

  const linhas: string[] = [base, ""];
  if (dados.descricao?.trim()) linhas.push(dados.descricao.trim(), "");
  const detalhes = [
    dados.marca ? `Marca: ${dados.marca}` : null,
    dados.categoria ? `Categoria: ${dados.categoria}` : null,
    ...variacoesTexto,
  ].filter(Boolean) as string[];
  if (detalhes.length) linhas.push(...detalhes.map((d) => `• ${d}`), "");
  linhas.push(`Preço: ${preco}`, "Produto novo, pronto para envio.", "Chame no privado para combinar entrega ou retirada.");

  const descricao = cortar(linhas.join("\n"), limites.descricao);
  return { titulo, descricao };
}
