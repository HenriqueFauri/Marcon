import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { formatBRL } from "@/lib/format";
import { limitesDoCanal } from "@/lib/anuncio";
import { rotuloDaEntrega, rotuloDoEstado, type PerguntasIA } from "@/lib/ia-perguntas";
import type { ProdutoVariacao } from "@/types/domain";

// Escrita de anúncio com IA (Claude). Só importar em código de servidor (actions):
// a chave nunca pode ir ao navegador.
// O modelo fica numa constante para trocar fácil depois do teste.
export const MODELO_IA = "claude-haiku-4-5";

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
  perguntas: PerguntasIA;
}

export interface SaidaIA {
  titulo: string;
  descricao: string;
  tokensEntrada: number;
  tokensSaida: number;
}

const INSTRUCOES = `Você escreve anúncios de produtos para pequenos vendedores brasileiros que vendem pelo celular em marketplaces e redes sociais.

Escreva em português do Brasil, com linguagem simples e direta de vendedor, sem exagero.

O que faz um anúncio bom: quem lê no celular entende em 5 segundos o que é, para que serve e por que vale a pena. Cada linha diz um fato do produto junto com o que ele muda para quem compra. Nada de enchimento.

Fatos:
- Use o que está nos dados do produto, nas respostas do vendedor e o que dá para ver com clareza nas fotos (cor, material aparente, acessórios que aparecem).
- Se a marca e o modelo forem de um produto que você conhece bem, pode usar as características técnicas conhecidas dele (tipo de driver, bateria, conexão, tela, potência etc.). Só o que você tem certeza que vale para aquele modelo. Na dúvida, deixe de fora.
- Nunca invente garantia, nota fiscal, medidas, compatibilidade, estado de conservação, frete grátis, prazo de entrega nem forma de entrega.
- Se o vendedor não disse se o produto é novo ou usado, não diga nenhum dos dois. Se ele respondeu o estado, escreva-o como uma linha ✅ (ex.: "✅ Novo, na caixa").
- Se há uma variação escolhida, o anúncio é só dela.

Texto:
- Respeite o limite de caracteres do canal para o título e para a descrição. Conte com folga.
- Título: comece pelo produto, depois marca e modelo, depois o atributo mais buscado (cor, tamanho, capacidade). Sem emojis, sem pontos de exclamação, sem CAIXA ALTA e sem palavras como "promoção", "imperdível" ou "barato".
- Proibido enchimento: "conforme as fotos", "entre em contato para mais detalhes", "produto de qualidade", "excelente", "ótimo custo-benefício" e frases parecidas que servem para qualquer produto.
- Facebook Marketplace, OLX, Instagram, WhatsApp e outros canais: a descrição abre com uma frase que diz o que é o produto e o principal ponto dele, seguida de 4 a 6 linhas curtas começando com ✅, cada uma com uma característica e, quando fizer sentido, o que ela significa no uso (ex.: "Microfone embutido, bom pra chamada e jogo"). Termine com uma linha de convite como "💬 Chama no chat pra combinar!". Só ponha a linha de retirada ou entrega (📍) se o vendedor respondeu como é, usando a resposta dele. Se respondeu o que acompanha, destaque isso numa linha ✅. Facebook Marketplace e OLX não levam preço no texto, porque o preço tem campo próprio. Instagram e WhatsApp terminam com o preço e um convite para chamar no privado; no Instagram, até 5 hashtags relevantes no fim.
- Mercado Livre e Shopee: sem emojis e sem links. Parágrafos curtos e uma lista de características com "•". O preço tem campo próprio, então não vai no texto.

Exemplo do nível esperado (só o formato e o tom: não copie os fatos para outro produto). Vendedor respondeu: estado "Novo, na caixa", acompanha "divisor de áudio P2", entrega "Retirada em mãos ou combinar entrega":
Título: Fone KZ EDX Pro X com Microfone – Preto
Descrição:
Fone de ouvido KZ EDX Pro X, driver híbrido, com microfone embutido.
✅ Grave potente, som equilibrado
✅ Microfone pra chamada e jogo
✅ Acompanha divisor de áudio P2 (ouça a dois)
✅ Novo, na caixa
📍 Retirada em mãos ou combinar entrega
💬 Chama no chat pra combinar!`;

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
  const estado = rotuloDoEstado(e.perguntas.estado);
  const entrega = rotuloDaEntrega(e.perguntas.entrega);
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
    "",
    "Respostas do vendedor:",
    estado
      ? `- Estado: ${estado}`
      : "- Estado: o vendedor não informou (não diga se é novo ou usado)",
    entrega
      ? `- Retirada e entrega: ${entrega}`
      : "- Retirada e entrega: o vendedor não informou (não escreva linha de retirada ou entrega)",
    e.perguntas.acompanha ? `- O que acompanha: ${e.perguntas.acompanha}` : null,
    e.perguntas.dica ? `- Outra informação: ${e.perguntas.dica}` : null,
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

  if (resposta.stop_reason === "refusal") throw new Error("A IA não quis escrever este anúncio. Tente com outras respostas.");
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
