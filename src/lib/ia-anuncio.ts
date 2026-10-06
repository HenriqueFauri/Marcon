import Anthropic from "@anthropic-ai/sdk";
import { formatBRL } from "@/lib/format";
import { limitesDoCanal } from "@/lib/anuncio";
import type { ProdutoVariacao } from "@/types/domain";

// Escrita de anúncio com IA (Claude). Só importar em código de servidor (actions):
// a chave nunca pode ir ao navegador.
// O modelo fica numa constante para trocar fácil depois do teste.
export const MODELO_IA = "claude-sonnet-5-5";

export function iaDisponivel() {
  return !!process.env.ANTHROPIC_API_KEY;
}

export interface EntradaIA {
  canal: string;
  nome: string;
  marca: string | null;
  categoria: string | null;
  descricao: string | null;
  precoVarejo: number;
  variacoes: ProdutoVariacao[];
  variacao: ProdutoVariacao | null;
  fotos: string[]; // URLs assinadas, no máximo 3
  dica: string;
}

export interface SaidaIA {
  titulo: string;
  descricao: string;
  tokensEntrada: number;
  tokensSaida: number;
}

const INSTRUCOES = `Você escreve anúncios de produtos para pequenos vendedores brasileiros que vendem pelo celular em marketplaces e redes sociais.

Escreva em português do Brasil, com linguagem simples e direta de vendedor, sem exagero.

Regras:
- Use só informações que estão nos dados do produto, na dica do vendedor ou que dá para ver com clareza nas fotos (cor, material aparente, acessórios que aparecem). Nunca invente garantia, nota fiscal, medidas, compatibilidade, estado de conservação, frete grátis ou prazo de entrega.
- Se o vendedor não disse se o produto é novo ou usado, não diga nenhum dos dois.
- Respeite o limite de caracteres do canal para o título e para a descrição. Conte com folga.
- Título: comece pelo produto, depois marca e modelo, depois o atributo mais buscado (cor, tamanho, capacidade). Sem emojis, sem pontos de exclamação, sem CAIXA ALTA e sem palavras como "promoção", "imperdível" ou "barato".
- Mercado Livre, Shopee, OLX e Facebook Marketplace: o preço tem campo próprio, então não ponha preço no texto. Descrição organizada em parágrafos curtos e uma lista de características com "•". Sem emojis e sem links.
- Instagram, WhatsApp e outros canais: a descrição pode ter poucos emojis, termina com o preço e um convite para chamar no privado. No Instagram, termine com até 5 hashtags relevantes.
- Se há uma variação escolhida, o anúncio é só dela.`;

const FORMATO = {
  type: "json_schema" as const,
  schema: {
    type: "object",
    properties: {
      titulo: { type: "string" },
      descricao: { type: "string" },
    },
    required: ["titulo", "descricao"],
    additionalProperties: false,
  },
};

function atributosTexto(v: ProdutoVariacao) {
  const attrs = Object.entries(v.atributos ?? {})
    .filter(([, valor]) => valor)
    .map(([chave, valor]) => `${chave}: ${valor}`);
  return attrs.length ? attrs.join(", ") : v.nome_combinacao;
}

function montarPedido(e: EntradaIA) {
  const limites = limitesDoCanal(e.canal);
  const preco = (v: ProdutoVariacao) => formatBRL(Number(v.preco_venda ?? e.precoVarejo));
  const linhas = [
    `Canal: ${e.canal}`,
    `Limite do título: ${limites.titulo ? `${limites.titulo} caracteres` : "sem limite fixo, até 100 caracteres"}`,
    `Limite da descrição: ${limites.descricao ? `${limites.descricao} caracteres` : "sem limite fixo, até 1500 caracteres"}`,
    "",
    "Dados do produto:",
    `- Nome: ${e.nome}`,
    e.marca ? `- Marca: ${e.marca}` : null,
    e.categoria ? `- Categoria: ${e.categoria}` : null,
    e.variacao
      ? `- Variação escolhida: ${atributosTexto(e.variacao)} — ${preco(e.variacao)}`
      : e.variacoes.length
        ? `- Variações: ${e.variacoes.map((v) => `${atributosTexto(v)} (${preco(v)})`).join("; ")}`
        : `- Preço: ${formatBRL(e.precoVarejo)}`,
    e.descricao?.trim() ? `- Descrição do cadastro: ${e.descricao.trim()}` : null,
    e.dica.trim() ? `\nDica do vendedor: ${e.dica.trim()}` : null,
    e.fotos.length ? `\nAs ${e.fotos.length} foto(s) acima são do produto.` : "\nO produto não tem fotos.",
  ];
  return linhas.filter((l) => l !== null).join("\n");
}

export async function escreverAnuncioComIA(e: EntradaIA): Promise<SaidaIA> {
  const client = new Anthropic();
  const resposta = await client.messages.create({
    model: MODELO_IA,
    max_tokens: 2000,
    system: INSTRUCOES,
    output_config: { format: FORMATO },
    messages: [
      {
        role: "user",
        content: [
          ...e.fotos.map((url) => ({ type: "image" as const, source: { type: "url" as const, url } })),
          { type: "text" as const, text: montarPedido(e) },
        ],
      },
    ],
  });

  if (resposta.stop_reason === "refusal") throw new Error("A IA não quis escrever este anúncio. Tente com outra dica.");
  if (resposta.stop_reason === "max_tokens") throw new Error("O texto ficou grande demais. Tente de novo.");

  const bloco = resposta.content.find((b) => b.type === "text");
  if (!bloco || bloco.type !== "text") throw new Error("A IA não devolveu texto. Tente de novo.");
  const dados = JSON.parse(bloco.text) as { titulo: string; descricao: string };

  return {
    titulo: dados.titulo.trim(),
    descricao: dados.descricao.trim(),
    tokensEntrada: resposta.usage.input_tokens,
    tokensSaida: resposta.usage.output_tokens,
  };
}
