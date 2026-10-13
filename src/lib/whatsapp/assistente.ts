import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { FERRAMENTAS, executarFerramenta, hojeParaOModelo, type Contexto } from "./ferramentas";
import { FERRAMENTA_VENDA } from "./venda";
import { ferramentasDeLancamento, instrucoesDeLancamento } from "./lancamentos";
import { somarDias } from "@/lib/format";

// Assistente de consultas do WhatsApp (só leitura). A memória da conversa vem de fora (route.ts):
// aqui só recebemos as últimas trocas já em ordem.

const MAX_VOLTAS = 5;

// Modelo mais leve e barato (Haiku 5.5). Consulta de estoque não precisa de raciocínio profundo:
// esforço baixo. Dá para trocar sem mexer no código com WHATSAPP_MODELO.
const MODELO = process.env.WHATSAPP_MODELO || "claude-haiku-5-5";
// quanto o modelo pensa antes de responder: mais esforço entende melhor frase torta, e custa e demora mais
const ESFORCO = (["low", "medium", "high"] as const).find((e) => e === process.env.WHATSAPP_ESFORCO) ?? "low";

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

// O que o sistema fez de verdade, lido do banco. Vale mais que a conversa: o modelo não tem como
// saber sozinho se um lançamento foi gravado, e sem isto chega a desmentir uma venda lançada.
function blocoDeFatos(fatos: string[] | undefined) {
  if (!fatos?.length) return "";
  return `

Registro do sistema nas últimas horas (é a verdade sobre o que foi ou não gravado; vale mais do que qualquer coisa dita na conversa, inclusive por você):
${fatos.map((f) => `- ${f}`).join("\n")}`;
}

// O que muda a cada mensagem (data, calendário, registro do sistema) fica FORA do bloco fixo, para o
// bloco fixo poder ser reaproveitado do cache da API: mais rápido e mais barato a cada pergunta.
function contextoDoMomento(fatos?: string[]) {
  const hoje = hojeParaOModelo();
  return `Hoje é ${hoje} (fuso de Brasília). Calendário dos últimos 14 dias, para converter dia da semana em data (a semana começa na segunda; "de sexta a domingo" é a sexta e o domingo mais recentes que já passaram):
${calendario(hoje)}${blocoDeFatos(fatos)}`;
}

// Como o vendedor realmente fala, e o que fazer. Exemplo vale mais que regra solta.
const EXEMPLOS_DE_VENDA = `
Como entender o vendedor (frases soltas, enroladas, vindas de áudio: ache o pedido no meio e ignore "então", "olha", "tipo" e cumprimento):
- "vendi 2 carregador por 80" = preparar_venda com quantidade 2 e valor_total_item 80 (sem "cada", 80 é o total). "vendi 2 a 80 cada" = preco_unitario 80.
- Número por extenso vira dígito: "dois" é 2, "oitenta reais" é 80, "cento e vinte" é 120.
- "vendi o d20 e um carregador" = UM preparar_venda com os 2 itens. Nunca faça duas vendas quando é uma frase só.
- "vendi ontem" ou "foi sexta" = campo data, pelo calendário acima.
- "vendi pro João" = campo cliente. "no pix", "no cartão", "em dinheiro" = forma_pagamento.
- "saiu um", "vendi esse", "vendi a prata" depois de uma consulta = o produto que acabou de ser consultado.
- Venda e pergunta na mesma mensagem ("vendi um d20 e quanto tenho de carregador?"): chame preparar_venda E a ferramenta da pergunta. O sistema mostra o resumo da venda sozinho, então responda só a pergunta, em uma frase. Se não houver outra pergunta, responda apenas "OK".
- "errei", "desfaz", "apaga": isso é só pelo Marcon, diga em uma frase.

Uma confirmação só (o resumo com SIM do sistema já é a confirmação):
- Nunca pergunte em texto antes de preparar uma venda ("é esse?", "quer que eu lance?", "confirma?"). Se há um candidato claro (o único que combina, o único com estoque), chame preparar_venda direto: o vendedor vê o resumo e responde SIM.
- Só pergunte antes quando houver DOIS ou mais candidatos plausíveis, e pergunte curto, com as opções, em uma frase ("Foi o Relógio Tomi ou o Smartwatch D20?"). Quando ele responder ("o smartwatch", "esse mesmo", "o primeiro"), chame preparar_venda na hora, sem pedir mais nada.
- Palavra genérica ("relógio", "fone", "capa", "carregador"): olhe a lista "Produtos do vendedor" e veja tudo o que pode ser, inclusive por sinônimo (smartwatch é relógio). Se for mais de um e não der para saber pela conversa, faça a pergunta curta acima. Se for um só, prepare a venda.
- Se ele corrigir o produto ("na real foi o smartwatch", "não, o outro"), prepare a venda do produto certo: o rascunho anterior é substituído sozinho.
- Nas ferramentas, sempre passe o nome do produto como está na lista, nunca a palavra genérica.`;

function instrucoes(escrita: boolean) {
  return `Você é o assistente do Marcon, um app de gestão para quem vende. Responde dentro do WhatsApp, para o dono do negócio, sobre o estoque, os preços e as vendas dele. Ele fala (muitas vezes por áudio) e está ocupado, atendendo cliente: entenda o que ele quer e resolva na hora, em poucas palavras.

Regras:
- Responda só com o que as ferramentas devolverem. Nunca invente produto, número ou preço. Se não achou, diga que não achou.
- O que você consegue ou não fazer é o que está escrito aqui, agora. Se antes na conversa você disse outra coisa (por exemplo, que só consulta), ignore: vale esta instrução.
- Você não sabe sozinho se algo foi gravado. Só afirme que uma venda ou lançamento foi feito, cancelado ou falhou se estiver no "Registro do sistema" abaixo. Nunca desminta o registro, nunca peça desculpa por um erro que você não tem como confirmar e nunca invente explicação (outro aparelho, não salvou).
- Se a mensagem não fizer sentido ou não for um pedido claro, diga em uma frase que não entendeu e peça para repetir. Não tente adivinhar nem responder a algo que ele não perguntou.
- Produto: buscar_produtos traz "bate". Com bate true, é o produto. Com bate false, é só parecido: pergunte "você quis dizer X?" e espere a resposta. Se a ferramenta devolver "parecidos", ofereça essas opções em uma frase. Se não vier nada, diga que não achou e peça o nome como está no cadastro. Nunca troque um produto por outro por conta própria.
- Qual ferramenta usar: produtos (preço, estoque) = buscar_produtos e produtos_por_estoque; totais do estoque = resumo_do_estoque; total vendido e lucro = resumo_de_vendas; "quais produtos vendi" ou "o que mais vendi" = produtos_vendidos; vendas por canal, forma de pagamento ou cliente = vendas_por_recorte; "quem me deve", "o que vence", parcelas e vendas a prazo em aberto = contas_a_receber; caixa, entradas, saídas e saldo = caixa_do_periodo; pedidos que chegaram pelo link da loja = pedidos_da_vitrine. Se a pergunta precisar de mais de uma, chame todas.
- Vendas a prazo entram em "vendido" mesmo sem estar pagas: se perguntarem o que já entrou de dinheiro, use o caixa.
- Para "pedido novo" na vitrine, diga quantos há e liste. Não diga que a vitrine está desligada: se não houver pedido, diga que não há pedido novo.
- Você lembra das mensagens recentes desta conversa: "e a preta?" ou "e ontem?" continuam o assunto anterior. Mensagem curta ("preto", "vendi", "2", "no pix") completa o que veio antes: junte as duas e aja, sem pedir para ele repetir o que já disse.
- Aja com o que já tem. Só faça pergunta quando faltar algo sem o qual não dá para seguir. Nunca pergunte o que dá para descobrir pela ferramenta ou pela conversa.
- Custo, lucro e margem só quando ele perguntar por isso (a exceção é "quanto vendi", abaixo). Ao falar de produto, diga estoque e preço de venda: o cliente pode estar olhando a tela.
${
  escrita
    ? `- Lançar venda: só quando o vendedor disser claramente que vendeu algo ("vendi 2 controles por 80 no pix"). Use preparar_venda com o que ele disse, na hora. O produto pode ser o que ele acabou de consultar ("vendi", "vendi esse", "saiu um"): use o último produto da conversa, com a variação que ele escolheu. Nunca pergunte preço, forma de pagamento, cliente nem canal: sem preço o sistema usa o do cadastro, e ele confere tudo no resumo antes do SIM. Nunca invente esses dados: deixe vazio o que ele não falou. Só pergunte antes de preparar se não der para saber qual produto ou qual variação. Se a ferramenta devolver "ambiguo", pergunte qual é em uma frase curta, com as opções. Se devolver "erro", explique em uma frase. Você nunca diz que a venda foi lançada: quem pede o SIM e lança é o sistema.
${
        instrucoesDeLancamento()
          ? `${instrucoesDeLancamento()}
- Se o pedido for outra coisa (alterar ou apagar algo, cancelar venda), diga em uma frase que isso ainda é só pelo Marcon.`
          : `- Se a pergunta não for sobre produtos, estoque, vendas ou lançar venda (ou for pedido de cadastrar ou alterar algo), diga em uma frase que por enquanto só consulta e lança vendas.`
      }`
    : `- Se a pergunta não for sobre produtos, estoque ou vendas (ou for pedido de lançar venda, cadastrar ou alterar algo), diga em uma frase que por enquanto só consulta estoque, preço e vendas.`
}
- Mensagens curtas, de WhatsApp: no máximo 3 linhas, fora as listas. Português do Brasil, tom simples e próximo, sem enrolação. Uma pergunta por vez.
- Valores em reais no formato R$ 1.234,50. Estoque em unidades.
- Para destacar use *negrito* do WhatsApp. Listas com "•". Sem tabelas, sem markdown de título.
- Nunca use travessão nem hífen como pausa. Use vírgula, dois-pontos ou ponto.
- Não use a palavra "fiado". Não explique o que são as ferramentas nem fale de código.
- Produto com variações (cor, tamanho): mostre o estoque de cada variação junto do total.
- Ao perguntarem "quanto vendi", diga o valor vendido, o número de vendas e o lucro.${escrita ? EXEMPLOS_DE_VENDA : ""}`;
}

// Mensagem de voz: o texto é uma transcrição e pode ter erro. O aviso vai junto da mensagem desta
// vez só (não é guardado no histórico), com as palavras em que o provedor ficou em dúvida.
function comAvisoDeVoz(pergunta: string, ctx: Contexto) {
  if (!ctx.porAudio) return pergunta;
  const duvida = ctx.duvidosas?.length ? ` Palavras em dúvida na transcrição: ${ctx.duvidosas.map((d) => `"${d}"`).join(", ")}.` : "";
  return `${pergunta}

[Aviso do sistema: mensagem de voz transcrita automaticamente, pode ter palavra errada.${duvida} Palavra solta sem sentido no começo ou no fim (cumprimento, apelido, ruído) deve ser ignorada. Nome de produto pode ter saído diferente do cadastro: confirme pela ferramenta, que tolera erro. Se o pedido não ficou claro, peça para repetir em vez de adivinhar.]`;
}

export async function responder(pergunta: string, ctx: Contexto, historico: Troca[] = []): Promise<string> {
  const client = new Anthropic();
  const mensagens: Anthropic.MessageParam[] = [
    ...historico.map((t) => ({ role: t.papel, content: t.texto })),
    { role: "user" as const, content: comAvisoDeVoz(pergunta, ctx) },
  ];

  // O bloco fixo (regras e ferramentas) é marcado para cache: a partir da segunda pergunta a API o
  // reaproveita, o que corta tempo e custo. O que muda a cada mensagem vai num bloco separado, depois.
  const sistema: Anthropic.TextBlockParam[] = [
    { type: "text", text: instrucoes(ctx.escrita), cache_control: { type: "ephemeral" } },
    ...(ctx.catalogo?.length
      ? [
          {
            type: "text" as const,
            // o catálogo muda pouco: também vai para o cache, entre as regras e o que muda a cada mensagem
            text: `Produtos do vendedor (nomes exatos do cadastro, os mais vendidos primeiro): ${ctx.catalogo.slice(0, 120).join("; ")}.`,
            cache_control: { type: "ephemeral" as const },
          },
        ]
      : []),
    { type: "text", text: contextoDoMomento(ctx.fatos) },
  ];
  const todas: Anthropic.Tool[] = ctx.escrita ? [...FERRAMENTAS, FERRAMENTA_VENDA, ...ferramentasDeLancamento()] : FERRAMENTAS;
  const ferramentas = todas.map((t, i) => (i === todas.length - 1 ? { ...t, cache_control: { type: "ephemeral" as const } } : t));

  let tokens = 0;
  let cacheados = 0;
  // texto pronto do servidor (resumo da venda a confirmar): vai ao vendedor sem o modelo reescrever
  let rascunho: string | null = null;
  const fim = (voltas: number) => {
    if (ctx.rastro) Object.assign(ctx.rastro, { voltas, tokens, cacheados });
    console.info(`[whatsapp] resposta em ${voltas} volta(s), ${tokens} tokens (${cacheados} do cache), ${historico.length} msgs de histórico`);
  };

  for (let volta = 0; volta < MAX_VOLTAS; volta++) {
    const resposta = await client.messages.create({
      model: MODELO,
      max_tokens: 800,
      output_config: { effort: ESFORCO },
      system: sistema,
      // com o rascunho já aberto, o modelo não pode montar outra venda por cima: só responder o resto
      tools: rascunho ? ferramentas.filter((t) => !t.name.startsWith("preparar_")) : ferramentas,
      messages: mensagens,
    });
    tokens += resposta.usage.input_tokens + resposta.usage.output_tokens;
    cacheados += resposta.usage.cache_read_input_tokens ?? 0;

    if (resposta.stop_reason !== "tool_use") {
      const texto = resposta.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        // regra de texto do Marcon: nunca travessão. Nome vindo do banco ("Relógio Tomi — Preto") também.
        .replace(/\s*[—–]\s*/g, ", ")
        .trim();
      fim(volta + 1);
      if (rascunho) {
        // o modelo só acrescenta a resposta à OUTRA parte do pedido; "OK" não acrescenta nada
        const extra = /^ok[.!]?$/i.test(texto) ? "" : texto;
        return extra ? `${rascunho}\n\n${extra}` : rascunho;
      }
      return texto || "Não consegui responder agora. Pode perguntar de outro jeito?";
    }

    mensagens.push({ role: "assistant", content: resposta.content });
    const usos = resposta.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    for (const u of usos) ctx.rastro?.ferramentas.push(u.name);

    const rodar = async (u: Anthropic.ToolUseBlock): Promise<Anthropic.ToolResultBlockParam> => {
      try {
        const saida = await executarFerramenta(u.name, (u.input ?? {}) as Record<string, unknown>, ctx);
        if (saida && typeof saida === "object" && "__resposta_final" in saida) {
          rascunho = String((saida as { __resposta_final: string }).__resposta_final);
          return {
            type: "tool_result",
            tool_use_id: u.id,
            content:
              "Feito. O sistema já mostrou o resumo da venda: NÃO repita nem comente a venda. Responda SOMENTE à outra pergunta dele, com os dados das ferramentas, em uma frase. Se ele não perguntou mais nada, responda apenas OK.",
          };
        }
        return { type: "tool_result", tool_use_id: u.id, content: JSON.stringify(saida) };
      } catch (e) {
        console.error("[whatsapp] ferramenta falhou", u.name, e);
        return { type: "tool_result", tool_use_id: u.id, content: "Falha ao consultar", is_error: true };
      }
    };

    // consultas não dependem umas das outras: rodam juntas. Rascunhos gravam, então vão em ordem.
    const resultados: Anthropic.ToolResultBlockParam[] = [];
    if (usos.some((u) => u.name.startsWith("preparar_"))) for (const u of usos) resultados.push(await rodar(u));
    else resultados.push(...(await Promise.all(usos.map(rodar))));

    // venda sozinha: o resumo já é a resposta, sem gastar mais uma volta. Se houve outra pergunta
    // (mais de uma ferramenta, ou "?" na mensagem), o modelo ainda precisa respondê-la.
    if (rascunho && usos.length === 1 && !pergunta.includes("?")) {
      fim(volta + 1);
      return rascunho;
    }
    mensagens.push({ role: "user", content: resultados });
  }

  if (rascunho) return rascunho;
  return "Essa pergunta ficou grande demais pra mim. Tenta perguntar de um jeito mais direto?";
}
