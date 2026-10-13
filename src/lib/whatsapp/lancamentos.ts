import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { formatBRL, formatData, hojeISO, somarDias } from "@/lib/format";
import {
  abrirAcao,
  gruposLiberados,
  igual,
  r2,
  termo,
  type ContextoAcao,
  type Db,
  type Entrada,
  type GrupoDeLancamento,
  type TipoAcao,
} from "./rascunho";
import type { Resultado } from "./acoes";

// Lançamentos além da venda: produto novo, entrada e saída de estoque, entrada e saída de caixa.
// DESLIGADOS por padrão. Cada grupo só existe para o modelo quando está em WHATSAPP_LANCAMENTOS
// (ex.: "produto,estoque,caixa") e a conta tem escrita liberada. Seguem as mesmas três regras da
// venda (venda.ts): o modelo só prepara, o rascunho guarda tudo já resolvido e o texto de
// confirmação é montado aqui.

const DATA = /^\d{4}-\d{2}-\d{2}$/;

const FERRAMENTAS: Record<GrupoDeLancamento, Anthropic.Tool> = {
  produto: {
    name: "preparar_produto",
    description:
      "Prepara o cadastro de um produto novo para o vendedor confirmar. NÃO cadastra nada: o sistema pede o SIM. Use quando ele pedir para cadastrar ou criar um produto. Deixe em branco o que ele não disse.",
    input_schema: {
      type: "object",
      properties: {
        nome: { type: "string", description: "Nome do produto, como o vendedor falou" },
        preco: { type: "number", description: "Preço de venda em reais" },
        custo: { type: "number", description: "Quanto ele paga em cada unidade, só se disse" },
        estoque_inicial: { type: "integer", description: "Quantas unidades já tem, só se disse" },
        marca: { type: "string", description: "Marca, só se disse" },
        categoria: { type: "string", description: "Categoria, só se disse" },
      },
      required: ["nome", "preco"],
    },
  },
  estoque: {
    name: "preparar_estoque",
    description:
      "Prepara uma entrada (chegou mercadoria, comprou mais) ou uma saída sem venda (perda, quebra, uso próprio, brinde, ajuste de contagem) de um produto que já existe. NÃO lança nada: o sistema pede o SIM. Venda não é saída de estoque: para venda use preparar_venda.",
    input_schema: {
      type: "object",
      properties: {
        tipo: { type: "string", enum: ["entrada", "saida"] },
        produto: { type: "string", description: "Nome ou parte do nome do produto" },
        variacao: { type: "string", description: "Cor, tamanho ou variação, só se o vendedor disse" },
        quantidade: { type: "integer", description: "Quantas unidades" },
        valor_unitario: { type: "number", description: "Entrada: quanto pagou em cada unidade, só se disse" },
        pago: {
          type: "boolean",
          description: "Entrada: false só se ele disse que não pagou agora ou que não é para mexer no caixa. Padrão true",
        },
        motivo: {
          type: "string",
          enum: ["perda", "uso", "ajuste"],
          description: "Saída: perda = perda ou quebra, uso = uso próprio ou brinde, ajuste = ajuste de contagem. Só se o vendedor disse",
        },
        observacao: { type: "string", description: "Detalhe curto, só se o vendedor disse" },
      },
      required: ["tipo", "produto", "quantidade"],
    },
  },
  caixa: {
    name: "preparar_caixa",
    description:
      "Prepara uma entrada ou uma saída de dinheiro no caixa que não é venda nem compra de estoque (aluguel, frete, embalagem, retirada, aporte). NÃO lança nada: o sistema pede o SIM.",
    input_schema: {
      type: "object",
      properties: {
        tipo: { type: "string", enum: ["entrada", "saida"] },
        descricao: { type: "string", description: "O que foi, em poucas palavras" },
        valor: { type: "number", description: "Valor em reais" },
        categoria: { type: "string", description: "Ex.: Aluguel, Frete, Embalagens, Retirada. Só se o vendedor disse" },
        data: { type: "string", description: "AAAA-MM-DD, só se não foi hoje (até 60 dias atrás)" },
      },
      required: ["tipo", "descricao", "valor"],
    },
  },
};

// ferramentas que o modelo enxerga: só as dos grupos ligados no servidor
export function ferramentasDeLancamento(): Anthropic.Tool[] {
  return gruposLiberados().map((g) => FERRAMENTAS[g]);
}

// linha das instruções do assistente, conforme o que está ligado
export function instrucoesDeLancamento(): string {
  const g = gruposLiberados();
  if (!g.length) return "";
  const partes = [
    g.includes("produto") ? 'cadastrar produto novo = preparar_produto ("cadastra fone bluetooth a 60")' : null,
    g.includes("estoque")
      ? 'chegou mercadoria ou saiu sem vender = preparar_estoque ("chegaram 10 panelas a 40 cada", "quebrou 1 copo")'
      : null,
    g.includes("caixa") ? 'dinheiro que entrou ou saiu fora de venda = preparar_caixa ("paguei 50 de frete")' : null,
  ].filter(Boolean);
  return `- Outros lançamentos: ${partes.join("; ")}. Valem as mesmas regras da venda: nunca invente valor, deixe em branco o que ele não disse, e quem pede o SIM e lança é o sistema.`;
}

export const NOMES_DAS_FERRAMENTAS = ["preparar_produto", "preparar_estoque", "preparar_caixa"] as const;

function dataValida(v: unknown) {
  const hoje = hojeISO();
  const dita = String(v ?? "");
  return DATA.test(dita) && dita <= hoje && dita >= somarDias(hoje, -60) ? dita : hoje;
}

function dinheiro(v: unknown) {
  const n = v == null || v === "" ? NaN : Number(v);
  return Number.isFinite(n) ? r2(n) : NaN;
}

// ---------------------------------------------------------------------------
// Produto novo
// ---------------------------------------------------------------------------

interface RascunhoProduto {
  nome: string;
  preco: number;
  custo: number;
  estoque: number;
  marca: string | null;
  categoriaId: string | null;
}

export async function prepararProduto(db: Db, ctx: ContextoAcao, entrada: Entrada): Promise<unknown> {
  const nome = String(entrada.nome ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
  if (nome.length < 2) return { erro: "Faltou o nome do produto." };

  const preco = dinheiro(entrada.preco);
  if (!(preco > 0) || preco > 1_000_000) return { erro: "Me diga o preço de venda do produto." };
  const custoDito = dinheiro(entrada.custo);
  if (Number.isFinite(custoDito) && (custoDito < 0 || custoDito > 1_000_000)) return { erro: "Confira o custo informado." };
  const custo = Number.isFinite(custoDito) ? custoDito : 0;
  const estoque = Math.trunc(Number(entrada.estoque_inicial) || 0);
  if (estoque < 0 || estoque > 100_000) return { erro: "Confira o estoque inicial." };

  const { data: iguais, error } = await db.from("produtos").select("nome").eq("owner_id", ctx.owner).ilike("nome", termo(nome, 120)).limit(1);
  if (error) throw error;
  if (iguais?.length) return { erro: `Já existe um produto chamado "${iguais[0].nome}". Se chegou mais, é entrada de estoque.` };

  const categoriaDita = termo(entrada.categoria);
  let categoriaId: string | null = null;
  let categoriaNome: string | null = null;
  if (categoriaDita) {
    const { data: cats } = await db.from("categorias").select("id, nome").eq("owner_id", ctx.owner).ilike("nome", categoriaDita).limit(2);
    if (cats?.length === 1) {
      categoriaId = cats[0].id as string;
      categoriaNome = cats[0].nome as string;
    }
  }

  const marca = String(entrada.marca ?? "").trim().slice(0, 60) || null;
  const rascunho: RascunhoProduto = { nome, preco, custo, estoque, marca, categoriaId };

  return abrirAcao(db, ctx, "produto", rascunho, [
    "*Cadastrar este produto?*",
    `• ${nome}`,
    `Preço: *${formatBRL(preco)}*`,
    custo > 0 ? `Custo: ${formatBRL(custo)}` : null,
    marca ? `Marca: ${marca}` : null,
    categoriaNome ? `Categoria: ${categoriaNome}` : categoriaDita ? "Categoria: fica sem (essa ainda não existe no seu cadastro)" : null,
    estoque > 0 ? `Estoque inicial: ${estoque} (não mexe no caixa)` : "Estoque inicial: 0",
  ]);
}

export async function executarProduto(db: Db, ctx: ContextoAcao, payload: unknown): Promise<Resultado> {
  const r = payload as RascunhoProduto;
  // insert direto com o dono: o gatilho de limite do plano lê new.owner_id e vale igual ao app
  const { data: produto, error } = await db
    .from("produtos")
    .insert({
      owner_id: ctx.owner,
      nome: r.nome,
      marca: r.marca,
      categoria_id: r.categoriaId,
      custo: r.custo,
      preco_varejo: r.preco,
      estoque_atual: 0,
      tem_variacoes: false,
    })
    .select("id")
    .single();
  if (error) throw error;

  if (r.estoque > 0) {
    const { error: erroEstoque } = await db.rpc("registrar_entrada_estoque_como", {
      p_owner: ctx.owner,
      p_produto_id: produto.id,
      p_variacao_id: null,
      p_quantidade: r.estoque,
      p_valor_unitario: r.custo,
      p_data: hojeISO(),
      p_observacoes: "Estoque inicial (WhatsApp)",
      p_afeta_caixa: false,
    });
    if (erroEstoque) {
      console.error("[whatsapp] estoque inicial", erroEstoque.message);
      return { referenciaId: produto.id, mensagem: `Produto cadastrado: ${r.nome}. O estoque inicial não entrou, lance pelo Marcon.` };
    }
  }
  return {
    referenciaId: produto.id,
    mensagem: `Produto cadastrado: ${r.nome}, a ${formatBRL(r.preco)}${r.estoque > 0 ? `, com ${r.estoque} em estoque` : ""}. Fotos e anúncio você coloca no Marcon.`,
  };
}

// ---------------------------------------------------------------------------
// Entrada e saída de estoque
// ---------------------------------------------------------------------------

interface RascunhoEstoque {
  tipo: "entrada" | "saida";
  produtoId: string;
  variacaoId: string | null;
  nome: string;
  quantidade: number;
  valorUnitario: number;
  pago: boolean;
  motivo: "perda" | "uso" | "ajuste" | null;
  observacao: string | null;
}

const MOTIVOS = { perda: "perda ou quebra", uso: "uso próprio ou brinde", ajuste: "ajuste de contagem" } as const;

// Um produto e, se ele tiver variações, uma variação. Nome exato tem prioridade; na dúvida devolve
// a pergunta para o modelo fazer, sem gravar nada.
async function acharProduto(db: Db, owner: string, entrada: Entrada) {
  const t = termo(entrada.produto);
  if (!t) return { erro: "Faltou o nome do produto." } as const;

  const { data: achados, error } = await db
    .from("produtos_com_estoque")
    .select("id, nome, tem_variacoes, estoque_total, custo")
    .eq("owner_id", owner)
    .eq("status", "ativo")
    .ilike("nome", `%${t}%`)
    .order("nome")
    .limit(6);
  if (error) throw error;
  if (!achados?.length) return { erro: `Não achei produto com "${t}" no seu cadastro.` } as const;

  const exatos = achados.filter((p) => igual(p.nome, t));
  const candidatos = exatos.length === 1 ? exatos : achados;
  if (candidatos.length > 1) return { ambiguo: candidatos.map((p) => p.nome), pergunta: "Qual desses produtos?" } as const;
  const p = candidatos[0];

  if (!p.tem_variacoes) {
    return { produtoId: p.id as string, variacaoId: null, nome: p.nome as string, estoque: Number(p.estoque_total), custo: Number(p.custo) } as const;
  }

  const { data: vars } = await db
    .from("produto_variacoes")
    .select("id, nome_combinacao, estoque, custo")
    .eq("owner_id", owner)
    .eq("produto_id", p.id);
  const pedida = termo(entrada.variacao);
  const parecidas = (vars ?? []).filter((v) => pedida && v.nome_combinacao.toLowerCase().includes(pedida.toLowerCase()));
  const exatas = parecidas.filter((v) => igual(v.nome_combinacao, pedida));
  const escolhidas = exatas.length === 1 ? exatas : parecidas;
  if (escolhidas.length !== 1) {
    return { ambiguo: (vars ?? []).map((v) => v.nome_combinacao), pergunta: `${p.nome} tem variações. Qual delas?` } as const;
  }
  const v = escolhidas[0];
  return {
    produtoId: p.id as string,
    variacaoId: v.id as string,
    nome: `${p.nome} (${v.nome_combinacao})`,
    estoque: Number(v.estoque),
    custo: Number(v.custo ?? p.custo),
  } as const;
}

export async function prepararEstoque(db: Db, ctx: ContextoAcao, entrada: Entrada): Promise<unknown> {
  const tipo = entrada.tipo === "saida" ? "saida" : entrada.tipo === "entrada" ? "entrada" : null;
  if (!tipo) return { erro: "Diga se é entrada ou saída de estoque." };
  const quantidade = Math.trunc(Number(entrada.quantidade) || 0);
  if (quantidade < 1 || quantidade > 100_000) return { erro: "Confira a quantidade." };

  const p = await acharProduto(db, ctx.owner, entrada);
  if ("erro" in p || "ambiguo" in p) return p;
  const observacao = String(entrada.observacao ?? "").trim().slice(0, 200) || null;

  if (tipo === "saida") {
    const motivo = entrada.motivo === "perda" || entrada.motivo === "uso" || entrada.motivo === "ajuste" ? entrada.motivo : null;
    if (!motivo) return { erro: "Pergunte o motivo da saída: perda ou quebra, uso próprio ou brinde, ou ajuste de contagem." };
    if (p.estoque < quantidade) return { erro: `${p.nome} tem só ${p.estoque} em estoque.` };
    const rascunho: RascunhoEstoque = { tipo, produtoId: p.produtoId, variacaoId: p.variacaoId, nome: p.nome, quantidade, valorUnitario: 0, pago: false, motivo, observacao };
    return abrirAcao(db, ctx, "estoque_saida", rascunho, [
      "*Confirma esta saída de estoque?*",
      `• ${quantidade}x ${p.nome}`,
      `Motivo: ${MOTIVOS[motivo]}`,
      `Estoque: de ${p.estoque} para ${p.estoque - quantidade}`,
      "Não mexe no caixa.",
    ]);
  }

  const dito = dinheiro(entrada.valor_unitario);
  if (Number.isFinite(dito) && (dito < 0 || dito > 1_000_000)) return { erro: "Confira o valor informado." };
  const valorUnitario = Number.isFinite(dito) ? dito : r2(p.custo);
  const pago = entrada.pago !== false;
  const total = r2(valorUnitario * quantidade);
  const rascunho: RascunhoEstoque = { tipo, produtoId: p.produtoId, variacaoId: p.variacaoId, nome: p.nome, quantidade, valorUnitario, pago, motivo: null, observacao };
  return abrirAcao(db, ctx, "estoque_entrada", rascunho, [
    "*Confirma esta entrada de estoque?*",
    `• ${quantidade}x ${p.nome} a ${formatBRL(valorUnitario)}${Number.isFinite(dito) ? "" : " (custo do cadastro)"}`,
    `Estoque: de ${p.estoque} para ${p.estoque + quantidade}`,
    pago && total > 0 ? `Sai do caixa: *${formatBRL(total)}*` : "Não mexe no caixa.",
  ]);
}

export async function executarEstoque(db: Db, ctx: ContextoAcao, payload: unknown): Promise<Resultado> {
  const r = payload as RascunhoEstoque;
  if (r.tipo === "saida") {
    const { data, error } = await db.rpc("registrar_saida_estoque_como", {
      p_owner: ctx.owner,
      p_produto_id: r.produtoId,
      p_variacao_id: r.variacaoId,
      p_quantidade: r.quantidade,
      p_motivo: r.motivo,
      p_data: hojeISO(),
      p_observacoes: r.observacao ?? "Pelo WhatsApp",
    });
    if (error) throw error;
    return { referenciaId: String(data), mensagem: `Saída lançada: ${r.quantidade}x ${r.nome}. O estoque já foi atualizado.` };
  }
  const { data, error } = await db.rpc("registrar_entrada_estoque_como", {
    p_owner: ctx.owner,
    p_produto_id: r.produtoId,
    p_variacao_id: r.variacaoId,
    p_quantidade: r.quantidade,
    p_valor_unitario: r.valorUnitario,
    p_data: hojeISO(),
    p_observacoes: r.observacao ?? "Pelo WhatsApp",
    p_afeta_caixa: r.pago,
  });
  if (error) throw error;
  return {
    referenciaId: String(data),
    mensagem: `Entrada lançada: ${r.quantidade}x ${r.nome}. Estoque${r.pago && r.valorUnitario > 0 ? " e caixa já foram atualizados" : " já foi atualizado"}.`,
  };
}

// ---------------------------------------------------------------------------
// Entrada e saída de caixa
// ---------------------------------------------------------------------------

interface RascunhoCaixa {
  tipo: "entrada" | "saida";
  descricao: string;
  valor: number;
  categoria: string;
  data: string;
}

export async function prepararCaixa(db: Db, ctx: ContextoAcao, entrada: Entrada): Promise<unknown> {
  const tipo = entrada.tipo === "saida" ? "saida" : entrada.tipo === "entrada" ? "entrada" : null;
  if (!tipo) return { erro: "Diga se o dinheiro entrou ou saiu." };
  const descricao = String(entrada.descricao ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
  if (!descricao) return { erro: "Faltou dizer o que foi." };
  const valor = dinheiro(entrada.valor);
  if (!(valor > 0) || valor > 10_000_000) return { erro: "Me diga o valor." };

  const categoria = String(entrada.categoria ?? "").replace(/\s+/g, " ").trim().slice(0, 40) || "Outros";
  const data = dataValida(entrada.data);
  const rascunho: RascunhoCaixa = { tipo, descricao, valor, categoria, data };
  const acao: TipoAcao = tipo === "entrada" ? "caixa_entrada" : "caixa_saida";

  return abrirAcao(db, ctx, acao, rascunho, [
    tipo === "entrada" ? "*Confirma esta entrada no caixa?*" : "*Confirma esta saída do caixa?*",
    `• ${descricao}`,
    `Valor: *${formatBRL(valor)}*`,
    `Categoria: ${categoria}`,
    data !== hojeISO() ? `Data: ${formatData(data)}` : null,
  ]);
}

export async function executarCaixa(db: Db, ctx: ContextoAcao, payload: unknown): Promise<Resultado> {
  const r = payload as RascunhoCaixa;
  // os mesmos campos de criarLancamentoManual (fluxo-de-caixa/actions.ts)
  const { data, error } = await db
    .from("lancamentos_caixa")
    .insert({
      owner_id: ctx.owner,
      tipo: r.tipo,
      origem: "manual",
      categoria: r.categoria,
      descricao: r.descricao,
      valor: r.valor,
      data: r.data,
      afeta_lucro: true,
      afeta_caixa: true,
    })
    .select("id")
    .single();
  if (error) throw error;
  return {
    referenciaId: data.id as string,
    mensagem: `${r.tipo === "entrada" ? "Entrada" : "Saída"} lançada no caixa: ${formatBRL(r.valor)} (${r.descricao}).`,
  };
}
