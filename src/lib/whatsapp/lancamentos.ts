import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { formatBRL, formatData, hojeISO } from "@/lib/format";
import {
  abrirAcao,
  dataValida,
  dinheiro,
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
import { umProduto } from "./produtos";
import { FERRAMENTA_RECEBIMENTO } from "./recebimento";

// Lançamentos além da venda: produto novo, entrada e saída de estoque, entrada e saída de caixa.
// Só existem para o modelo quando a conta tem permissão de lançar, dada no /admin (acesso.ts).
// Seguem as mesmas três regras da
// venda (venda.ts): o modelo só prepara, o rascunho guarda tudo já resolvido e o texto de
// confirmação é montado aqui.

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
        usar_foto: { type: "boolean", description: "true quando o vendedor mandou a foto do produto e o sistema avisou que ela está guardada" },
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
  return [...gruposLiberados().map((g) => FERRAMENTAS[g]), FERRAMENTA_RECEBIMENTO];
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
  return `- Outros lançamentos: ${partes.join("; ")}. Valem as mesmas regras da venda: nunca invente valor, deixe em branco o que ele não disse, e quem pede o SIM e lança é o sistema.
- Cliente pagou uma parcela ("o João pagou", "a Maria me pagou 50") = preparar_recebimento só com o que ele disse; o sistema escolhe a parcela. Isso não é pergunta de "quem me deve" (essa é contas_a_receber).
- Foto de produto: quando a mensagem do vendedor traz "[Foto de produto recebida ...]", o sistema já olhou a foto e guardou. Se o preço está na legenda ou na conversa, chame preparar_produto com usar_foto true, o nome e a categoria sugeridos (o vendedor pode ter pedido outro nome). Se faltar o preço, pergunte só o preço. Se o sistema não identificou o produto, pergunte o nome e o preço.`;
}

export const NOMES_DAS_FERRAMENTAS = ["preparar_produto", "preparar_estoque", "preparar_caixa", "preparar_recebimento"] as const;

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
  fotoPath: string | null; // foto já guardada no bucket produto-fotos, na pasta do dono
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

  const limite = await limiteDeProdutos(db, ctx.owner);
  if (limite) return { erro: limite };

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
  let fotoPath: string | null = null;
  if (entrada.usar_foto === true) {
    fotoPath = await acharFoto(db, ctx);
    if (!fotoPath) return { erro: "Não achei a foto. Peça para o vendedor mandar de novo." };
  }
  const rascunho: RascunhoProduto = { nome, preco, custo, estoque, marca, categoriaId, fotoPath };

  return abrirAcao(db, ctx, "produto", rascunho, [
    "*Cadastrar este produto?*",
    `• ${nome}`,
    `Preço: *${formatBRL(preco)}*`,
    custo > 0 ? `Custo: ${formatBRL(custo)}` : null,
    marca ? `Marca: ${marca}` : null,
    categoriaNome ? `Categoria: ${categoriaNome}` : categoriaDita ? "Categoria: fica sem (essa ainda não existe no seu cadastro)" : null,
    estoque > 0 ? `Estoque inicial: ${estoque} (não mexe no caixa)` : "Estoque inicial: 0",
    fotoPath ? "Foto: a que você mandou" : null,
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

  // a foto é um extra: se não entrar, o produto continua cadastrado e o vendedor é avisado
  let fotoSalva = false;
  if (r.fotoPath && caminhoDoDono(r.fotoPath, ctx.owner)) {
    const { error: erroFoto } = await db.from("produto_fotos").insert({ owner_id: ctx.owner, produto_id: produto.id, path: r.fotoPath, ordem: 0 });
    if (erroFoto) {
      console.error("[whatsapp] foto do produto", erroFoto.message);
      await apagarFotoDoRascunho(db, ctx.owner, r);
    } else fotoSalva = true;
  }

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
      return { referenciaId: produto.id, mensagem: `Produto cadastrado: ${r.nome}${fotoSalva ? ", com a foto" : ""}. O estoque inicial não entrou, lance pelo Marcon.` };
    }
  }
  return {
    referenciaId: produto.id,
    mensagem: `Produto cadastrado: ${r.nome}, a ${formatBRL(r.preco)}${r.estoque > 0 ? `, com ${r.estoque} em estoque` : ""}. ${fotoSalva ? "A foto já está no produto. O anúncio você faz no Marcon." : r.fotoPath ? "A foto não entrou, coloque pelo Marcon." : "Fotos e anúncio você coloca no Marcon."}`,
  };
}

// Mesma regra do banco (caminho_do_dono, migration 0031): dentro da pasta do dono e sem "..".
function caminhoDoDono(caminho: string, owner: string) {
  return caminho.startsWith(`${owner}/`) && !caminho.includes("..");
}

// A foto que o vendedor mandou: a desta mensagem (ctx.foto) ou a última dos 30 minutos anteriores,
// guardada na conversa. Passa a ser do rascunho, então sai da conversa para não valer duas vezes.
async function acharFoto(db: Db, ctx: ContextoAcao): Promise<string | null> {
  if (ctx.foto) {
    ctx.foto.usada = true;
    return ctx.foto.path;
  }
  const desde = new Date(Date.now() - 30 * 60_000).toISOString();
  const { data } = await db
    .from("whatsapp_conversas")
    .select("id, foto_path")
    .eq("telefone", ctx.telefone)
    .not("foto_path", "is", null)
    .gte("criado_em", desde)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  const path = (data?.foto_path as string | null) ?? null;
  if (!path || !caminhoDoDono(path, ctx.owner)) return null;
  await db.from("whatsapp_conversas").update({ foto_path: null }).eq("id", data!.id);
  return path;
}

// Rascunho cancelado, vencido ou que falhou: a foto guardada para ele não serve mais.
export async function apagarFotoDoRascunho(db: Db, owner: string, payload: unknown) {
  const path = (payload as { fotoPath?: string | null } | null)?.fotoPath;
  if (!path || !caminhoDoDono(path, owner)) return;
  const { error } = await db.storage.from("produto-fotos").remove([path]);
  if (error) console.error("[whatsapp] apagar foto", error.message);
}

// Limite de produtos do plano grátis, avisado já na hora de preparar (o gatilho do banco continua valendo).
async function limiteDeProdutos(db: Db, owner: string): Promise<string | null> {
  const { data: plano } = await db.rpc("plano_do_usuario", { p_owner: owner });
  if (typeof plano !== "string") return null;
  const { data: limites } = await db.rpc("limites_do_plano", { p_plano: plano });
  const max = (limites as { produtos?: number | null } | null)?.produtos;
  if (typeof max !== "number") return null;
  const { count } = await db.from("produtos").select("id", { count: "exact", head: true }).eq("owner_id", owner);
  return (count ?? 0) >= max ? `Você chegou ao limite de ${max} produtos do plano grátis. Assine o plano Marcon para cadastrar sem limite.` : null;
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
  aproximado?: boolean; // produto achado por semelhança: exige o SIM (ver acoes.ts)
}

const MOTIVOS = { perda: "perda ou quebra", uso: "uso próprio ou brinde", ajuste: "ajuste de contagem" } as const;

// Um produto e, se ele tiver variações, uma variação. Nome exato tem prioridade; na dúvida devolve
// a pergunta para o modelo fazer, sem gravar nada.
async function acharProduto(db: Db, owner: string, entrada: Entrada) {
  const t = termo(entrada.produto);
  if (!t) return { falta: { erro: "Faltou o nome do produto." } } as const;

  const achado = await umProduto(db, owner, t);
  if ("falta" in achado) return { falta: achado.falta } as const;
  const p = achado.produto;
  const aproximado = !achado.firme;

  if (!p.tem_variacoes) {
    return { produtoId: p.id, variacaoId: null, nome: p.nome, estoque: p.estoque_total, custo: p.custo, aproximado } as const;
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
    return { falta: { ambiguo: (vars ?? []).map((v) => v.nome_combinacao), pergunta: `${p.nome} tem variações. Qual delas?` } } as const;
  }
  const v = escolhidas[0];
  return {
    produtoId: p.id as string,
    variacaoId: v.id as string,
    nome: `${p.nome} (${v.nome_combinacao})`,
    estoque: Number(v.estoque),
    custo: Number(v.custo ?? p.custo),
    aproximado,
  } as const;
}

export async function prepararEstoque(db: Db, ctx: ContextoAcao, entrada: Entrada): Promise<unknown> {
  const tipo = entrada.tipo === "saida" ? "saida" : entrada.tipo === "entrada" ? "entrada" : null;
  if (!tipo) return { erro: "Diga se é entrada ou saída de estoque." };
  const quantidade = Math.trunc(Number(entrada.quantidade) || 0);
  if (quantidade < 1 || quantidade > 100_000) return { erro: "Confira a quantidade." };

  const p = await acharProduto(db, ctx.owner, entrada);
  if ("falta" in p) return p.falta;
  const observacao = String(entrada.observacao ?? "").trim().slice(0, 200) || null;

  if (tipo === "saida") {
    const motivo = entrada.motivo === "perda" || entrada.motivo === "uso" || entrada.motivo === "ajuste" ? entrada.motivo : null;
    if (!motivo) return { erro: "Pergunte o motivo da saída: perda ou quebra, uso próprio ou brinde, ou ajuste de contagem." };
    if (p.estoque < quantidade) return { erro: `${p.nome} tem só ${p.estoque} em estoque.` };
    const rascunho: RascunhoEstoque = { tipo, produtoId: p.produtoId, variacaoId: p.variacaoId, nome: p.nome, quantidade, valorUnitario: 0, pago: false, motivo, observacao, aproximado: p.aproximado };
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
  const rascunho: RascunhoEstoque = { tipo, produtoId: p.produtoId, variacaoId: p.variacaoId, nome: p.nome, quantidade, valorUnitario, pago, motivo: null, observacao, aproximado: p.aproximado };
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
