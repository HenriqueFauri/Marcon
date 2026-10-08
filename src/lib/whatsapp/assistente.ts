import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { FERRAMENTAS, executarFerramenta, hojeParaOModelo } from "./ferramentas";
import { somarDias } from "@/lib/format";

// Assistente de consultas do WhatsApp (só leitura). A memória da conversa vem de fora (route.ts):
// aqui só recebemos as últimas trocas já em ordem.

const MAX_VOLTAS = 5;

// Modelo mais leve e barato (Haiku 5.5). Consulta de estoque não precisa de raciocínio profundo:
// esforço baixo. Dá para trocar sem mexer no código com WHATSAPP_MODELO.
const MODELO = process.env.WHATSAPP_MODELO || "claude-haiku-5-5";

export interface Troca {
  papel: "user" | "assistant";
  texto: string;
}

const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

// os últimos 14 dias com o dia da semana: o modelo erra conta de calendário, então damos pronto
function calendario(hoje: string) {
  const linhas: string[] = [];
  for (let i = 0; i < 14; i++) {
    const dia = somarDias(hoje, -i);
    const nome = DIAS[new Date(`${dia}T12:00:00Z`).getUTCDay()];
    linhas.push(`${nome} ${dia.slice(8)}/${dia.slice(5, 7)} = ${dia}${i === 0 ? " (hoje)" : i === 1 ? " (ontem)" : ""}`);
  }
  return linhas.join("\n");
}

function instrucoes() {
  const hoje = hojeParaOModelo();
  return `Você é o assistente do Marcon, um app de gestão para quem vende. Responde dentro do WhatsApp, para o dono do negócio, sobre o estoque, os preços e as vendas dele.

Hoje é ${hoje} (fuso de Brasília). Calendário dos últimos 14 dias, para converter dia da semana em data (a semana começa na segunda; "de sexta a domingo" é a sexta e o domingo mais recentes que já passaram):
${calendario(hoje)}

Regras:
- Responda só com o que as ferramentas devolverem. Nunca invente produto, número ou preço. Se não achou, diga que não achou.
- Para "quais produtos vendi" ou "o que mais vendi" em um período, use produtos_vendidos. Para o total de vendas e o lucro, use resumo_de_vendas. Se precisar dos dois, chame os dois.
- Você lembra das mensagens recentes desta conversa: "e a preta?" ou "e ontem?" continuam o assunto anterior.
- Se a pergunta não for sobre produtos, estoque ou vendas (ou for um pedido de lançar venda, cadastrar ou alterar algo), diga em uma frase que por enquanto só consulta estoque, preço e vendas.
- Mensagens curtas, de WhatsApp. Português do Brasil, tom simples e próximo, sem enrolação.
- Valores em reais no formato R$ 1.234,50. Estoque em unidades.
- Para destacar use *negrito* do WhatsApp. Listas com "•". Sem tabelas, sem markdown de título.
- Nunca use travessão nem hífen como pausa. Use vírgula, dois-pontos ou ponto.
- Não use a palavra "fiado". Não explique o que são as ferramentas nem fale de código.
- Produto com variações (cor, tamanho): mostre o estoque de cada variação junto do total.
- Ao perguntarem "quanto vendi", diga o valor vendido, o número de vendas e o lucro.`;
}

export async function responder(pergunta: string, owner: string, historico: Troca[] = []): Promise<string> {
  const client = new Anthropic();
  const mensagens: Anthropic.MessageParam[] = [
    ...historico.map((t) => ({ role: t.papel, content: t.texto })),
    { role: "user" as const, content: pergunta },
  ];
  let tokens = 0;

  for (let volta = 0; volta < MAX_VOLTAS; volta++) {
    const resposta = await client.messages.create({
      model: MODELO,
      max_tokens: 800,
      output_config: { effort: "low" },
      system: instrucoes(),
      tools: FERRAMENTAS,
      messages: mensagens,
    });
    tokens += resposta.usage.input_tokens + resposta.usage.output_tokens;

    if (resposta.stop_reason !== "tool_use") {
      const texto = resposta.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      console.info(`[whatsapp] resposta em ${volta + 1} volta(s), ${tokens} tokens, ${historico.length} msgs de histórico`);
      return texto || "Não consegui responder agora. Pode perguntar de outro jeito?";
    }

    mensagens.push({ role: "assistant", content: resposta.content });
    const resultados: Anthropic.ToolResultBlockParam[] = [];
    for (const bloco of resposta.content) {
      if (bloco.type !== "tool_use") continue;
      try {
        const saida = await executarFerramenta(bloco.name, (bloco.input ?? {}) as Record<string, unknown>, owner);
        resultados.push({ type: "tool_result", tool_use_id: bloco.id, content: JSON.stringify(saida) });
      } catch (e) {
        console.error("[whatsapp] ferramenta falhou", bloco.name, e);
        resultados.push({ type: "tool_result", tool_use_id: bloco.id, content: "Falha ao consultar", is_error: true });
      }
    }
    mensagens.push({ role: "user", content: resultados });
  }

  return "Essa pergunta ficou grande demais pra mim. Tenta perguntar de um jeito mais direto?";
}
