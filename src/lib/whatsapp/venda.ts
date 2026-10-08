import "server-only";
import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { avisarVenda } from "@/lib/push/eventos";
import { mensagemDeErro } from "@/lib/action";
import { formatBRL, formatData, hojeISO, somarDias } from "@/lib/format";

// Lançar venda pelo WhatsApp. REGRAS QUE NÃO PODEM QUEBRAR:
// 1) O modelo só PREPARA (preparar_venda grava um rascunho). Quem LANÇA é resolverPendente(), código
//    do servidor que só roda quando a mensagem do vendedor é exatamente um SIM.
// 2) O rascunho guarda produto, variação, quantidade e preço já resolvidos: o SIM executa o que foi
//    mostrado, não o que o modelo entenderia de novo.
// 3) O texto de confirmação é montado aqui, não pelo modelo, para o valor mostrado ser o valor gravado.

type Db = NonNullable<ReturnType<typeof createAdminClient>>;
type Entrada = Record<string, unknown>;

export interface ContextoVenda {
  owner: string;
  telefone: string;
  user?: User; // para o aviso (push) da venda, com as preferências de notificação dele
}

const MINUTOS_DO_RASCUNHO = 10;
const DATA = /^\d{4}-\d{2}-\d{2}$/;

export const SIM = /^\s*(sim|s|confirmo|confirma|confirmar|pode|pode lan[cç]ar)\s*[.!]?\s*$/i;
export const NAO = /^\s*(n[aã]o|n|cancela|cancelar)\s*[.!]?\s*$/i;

export const FERRAMENTA_VENDA = {
  name: "preparar_venda",
  description:
    "Prepara o lançamento de uma venda para o vendedor confirmar. NÃO lança nada: o sistema pede o SIM do vendedor e só então grava. Use quando o vendedor disser claramente que vendeu algo. Deixe em branco o que ele não disse (preço, cliente, forma de pagamento, canal).",
  input_schema: {
    type: "object" as const,
    properties: {
      itens: {
        type: "array",
        description: "Produtos vendidos (de 1 a 10)",
        items: {
          type: "object",
          properties: {
            produto: { type: "string", description: "Nome ou parte do nome do produto, como o vendedor falou" },
            variacao: { type: "string", description: "Cor, tamanho ou variação, só se o vendedor disse" },
            quantidade: { type: "integer", description: "Quantidade vendida (padrão 1)" },
            preco_unitario: { type: "number", description: "Preço de cada unidade em reais, só se o vendedor disse" },
          },
          required: ["produto", "quantidade"],
        },
      },
      desconto: { type: "number", description: "Desconto total em reais, só se o vendedor disse" },
      forma_pagamento: { type: "string", description: "Ex.: PIX, dinheiro, cartão. Só se o vendedor disse" },
      canal: { type: "string", description: "Onde vendeu, ex.: Instagram, OLX. Só se o vendedor disse" },
      cliente: { type: "string", description: "Nome do cliente, só se o vendedor disse" },
      a_prazo: { type: "boolean", description: "true só se for venda a prazo (fiado, parcelado, pago depois)" },
      parcelas: { type: "integer", description: "Número de parcelas, só para venda a prazo" },
      primeiro_vencimento: { type: "string", description: "Data da primeira parcela, AAAA-MM-DD, só para venda a prazo" },
      data: { type: "string", description: "Data da venda AAAA-MM-DD, só se não foi hoje (até 60 dias atrás)" },
    },
    required: ["itens"],
  },
};

function termo(v: unknown) {
  return String(v ?? "")
    .replace(/[%_,()*\\]/g, " ")
    .trim()
    .slice(0, 60);
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const igual = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

interface ItemRascunho {
  produto_id: string;
  variacao_id: string | null;
  quantidade: number;
  preco_unitario: number;
}

interface Rascunho {
  itens: ItemRascunho[];
  clienteId: string | null;
  clienteNome: string | null;
  canalId: string | null;
  canalNome: string | null;
  formaId: string | null;
  formaNome: string | null;
  tipo: "a_vista" | "a_prazo";
  parcelas: number;
  primeiroVencimento: string;
  data: string;
  desconto: number;
  total: number;
}

// o que o cadastro do vendedor já tem (forma de pagamento, canal, cliente): usa o nome e o id de lá
async function achar(db: Db, tabela: "formas_pagamento" | "canais_venda" | "clientes", owner: string, nome: string) {
  const { data } = await db.from(tabela).select("id, nome").eq("owner_id", owner).ilike("nome", nome.replace(/[%_,()*\\]/g, " ").trim()).limit(2);
  return data && data.length === 1 ? { id: data[0].id as string, nome: data[0].nome as string } : null;
}

export async function prepararVenda(db: Db, ctx: ContextoVenda, entrada: Entrada): Promise<unknown> {
  const pedidos = Array.isArray(entrada.itens) ? (entrada.itens as Entrada[]) : [];
  if (!pedidos.length || pedidos.length > 10) return { erro: "Diga o que foi vendido (de 1 a 10 itens)." };

  const itens: ItemRascunho[] = [];
  const linhas: string[] = [];

  for (const it of pedidos) {
    const quantidade = Math.trunc(Number(it.quantidade) || 1);
    if (quantidade < 1 || quantidade > 1000) return { erro: "Confira a quantidade vendida." };
    const t = termo(it.produto);
    if (!t) return { erro: "Faltou o nome do produto." };

    const { data: achados, error } = await db
      .from("produtos_com_estoque")
      .select("id, nome, tem_variacoes, estoque_total, preco_varejo")
      .eq("owner_id", ctx.owner)
      .eq("status", "ativo")
      .ilike("nome", `%${t}%`)
      .order("nome")
      .limit(6);
    if (error) throw error;
    if (!achados?.length) return { erro: `Não achei produto com "${t}" no seu cadastro.` };

    const exatos = achados.filter((p) => igual(p.nome, t));
    const candidatos = exatos.length === 1 ? exatos : achados;
    if (candidatos.length > 1) {
      return { ambiguo: candidatos.map((p) => p.nome), pergunta: "Qual desses produtos foi vendido?" };
    }
    const p = candidatos[0];

    let variacaoId: string | null = null;
    let nomeLinha = p.nome as string;
    let estoque = Number(p.estoque_total);
    let preco = Number(p.preco_varejo);

    if (p.tem_variacoes) {
      const { data: vars } = await db
        .from("produto_variacoes")
        .select("id, nome_combinacao, estoque, preco_venda")
        .eq("owner_id", ctx.owner)
        .eq("produto_id", p.id);
      const pedida = termo(it.variacao);
      const parecidas = (vars ?? []).filter((v) => pedida && v.nome_combinacao.toLowerCase().includes(pedida.toLowerCase()));
      const exatas = parecidas.filter((v) => igual(v.nome_combinacao, pedida));
      const escolhidas = exatas.length === 1 ? exatas : parecidas;
      if (escolhidas.length !== 1) {
        return {
          ambiguo: (vars ?? []).map((v) => v.nome_combinacao),
          pergunta: `${p.nome} tem variações. Qual foi vendida?`,
        };
      }
      const v = escolhidas[0];
      variacaoId = v.id;
      nomeLinha = `${p.nome} (${v.nome_combinacao})`;
      estoque = Number(v.estoque);
      preco = Number(v.preco_venda ?? p.preco_varejo);
    }

    if (estoque < quantidade) return { erro: `${nomeLinha} tem só ${estoque} em estoque.` };

    const dito = it.preco_unitario == null ? NaN : Number(it.preco_unitario);
    if (Number.isFinite(dito)) {
      if (dito < 0 || dito > 1_000_000) return { erro: "Confira o preço informado." };
      preco = dito;
    } else if (!(preco > 0)) {
      return { erro: `${nomeLinha} está sem preço cadastrado. Me diga por quanto vendeu.` };
    }
    preco = r2(preco);

    itens.push({ produto_id: p.id, variacao_id: variacaoId, quantidade, preco_unitario: preco });
    linhas.push(`• ${quantidade}x ${nomeLinha} a ${formatBRL(preco)}`);
  }

  const subtotal = r2(itens.reduce((s, i) => s + i.quantidade * i.preco_unitario, 0));
  const desconto = r2(Math.max(0, Number(entrada.desconto) || 0));
  if (desconto > subtotal) return { erro: "O desconto é maior que o total da venda." };
  const total = r2(subtotal - desconto);

  const hoje = hojeISO();
  const aPrazo = entrada.a_prazo === true;
  const clienteDito = termo(entrada.cliente).slice(0, 80);
  if (aPrazo && !clienteDito) return { erro: "Venda a prazo precisa do nome do cliente, pra saber de quem cobrar." };

  const dataDita = String(entrada.data ?? "");
  const data = DATA.test(dataDita) && dataDita <= hoje && dataDita >= somarDias(hoje, -60) ? dataDita : hoje;
  const parcelas = aPrazo ? Math.min(Math.max(Math.trunc(Number(entrada.parcelas) || 1), 1), 12) : 1;
  const venc = String(entrada.primeiro_vencimento ?? "");
  const primeiroVencimento = DATA.test(venc) && venc >= data ? venc : aPrazo ? somarDias(data, 30) : data;

  const [cliente, forma, canal] = await Promise.all([
    clienteDito ? achar(db, "clientes", ctx.owner, clienteDito) : null,
    termo(entrada.forma_pagamento) ? achar(db, "formas_pagamento", ctx.owner, termo(entrada.forma_pagamento)) : null,
    termo(entrada.canal) ? achar(db, "canais_venda", ctx.owner, termo(entrada.canal)) : null,
  ]);

  const rascunho: Rascunho = {
    itens,
    clienteId: cliente?.id ?? null,
    clienteNome: cliente?.nome ?? (clienteDito || null),
    canalId: canal?.id ?? null,
    canalNome: canal?.nome ?? (termo(entrada.canal) || null),
    formaId: forma?.id ?? null,
    formaNome: forma?.nome ?? (termo(entrada.forma_pagamento) || null),
    tipo: aPrazo ? "a_prazo" : "a_vista",
    parcelas,
    primeiroVencimento,
    data,
    desconto,
    total,
  };

  const resumo = [
    "*Confirma esta venda?*",
    ...linhas,
    desconto > 0 ? `Desconto: ${formatBRL(desconto)}` : null,
    `Total: *${formatBRL(total)}*`,
    aPrazo
      ? `A prazo em ${parcelas}x para ${rascunho.clienteNome}, primeiro vencimento ${formatData(primeiroVencimento)}`
      : rascunho.formaNome
        ? `Pagamento: ${rascunho.formaNome}`
        : null,
    !aPrazo && rascunho.clienteNome ? `Cliente: ${rascunho.clienteNome}` : null,
    rascunho.canalNome ? `Canal: ${rascunho.canalNome}` : null,
    data !== hoje ? `Data da venda: ${formatData(data)}` : null,
    "",
    `Responda *SIM* para lançar ou *NÃO* para cancelar. Vale por ${MINUTOS_DO_RASCUNHO} minutos.`,
  ]
    .filter((l) => l !== null)
    .join("\n");

  // um rascunho aberto por número: o novo cancela o anterior
  const agora = new Date().toISOString();
  await db.from("whatsapp_acoes").update({ status: "cancelada", resolvida_em: agora }).eq("telefone", ctx.telefone).eq("status", "pendente");
  const { error: erroGravar } = await db.from("whatsapp_acoes").insert({
    owner_id: ctx.owner,
    telefone: ctx.telefone,
    tipo: "venda",
    payload: rascunho,
    resumo,
    expira_em: new Date(Date.now() + MINUTOS_DO_RASCUNHO * 60_000).toISOString(),
  });
  if (erroGravar) throw erroGravar;

  return { __resposta_final: resumo };
}

// Chamada pela rota ANTES do modelo: se há rascunho aberto neste número e a mensagem é SIM ou NÃO,
// resolve aqui e devolve o texto da resposta. Devolve null quando a mensagem é outra coisa.
export async function resolverPendente(db: Db, ctx: ContextoVenda, texto: string, maxPorDia: number): Promise<string | null> {
  const quer = SIM.test(texto) ? "sim" : NAO.test(texto) ? "nao" : null;
  if (!quer) return null;

  const { data: acao } = await db
    .from("whatsapp_acoes")
    .select("id, owner_id, payload, expira_em")
    .eq("telefone", ctx.telefone)
    .eq("status", "pendente")
    .maybeSingle();
  if (!acao || acao.owner_id !== ctx.owner) return null;

  const agora = new Date().toISOString();

  if (quer === "nao") {
    await db.from("whatsapp_acoes").update({ status: "cancelada", resolvida_em: agora }).eq("id", acao.id).eq("status", "pendente");
    return "Certo, cancelei. Nada foi lançado.";
  }

  if (new Date(acao.expira_em).getTime() < Date.now()) {
    await db.from("whatsapp_acoes").update({ status: "expirada", resolvida_em: agora }).eq("id", acao.id).eq("status", "pendente");
    return "Esse pedido de venda expirou, por segurança. Me conta a venda de novo.";
  }

  // trava: só uma execução por rascunho, mesmo que o provedor entregue o SIM duas vezes
  const { data: reservada } = await db
    .from("whatsapp_acoes")
    .update({ status: "executando" })
    .eq("id", acao.id)
    .eq("status", "pendente")
    .select("id")
    .maybeSingle();
  if (!reservada) return null;

  const { data: dentro } = await db.rpc("consumir_limite", { p_chave: `wa:venda:${ctx.owner}`, p_max: maxPorDia, p_segundos: 86400 });
  if (dentro !== true) {
    await db.from("whatsapp_acoes").update({ status: "falhou", erro: "limite diário", resolvida_em: agora }).eq("id", acao.id);
    return "Você chegou no limite de vendas lançadas por aqui hoje. Lance as outras direto no Marcon.";
  }

  const r = acao.payload as Rascunho;
  const { data: vendaId, error } = await db.rpc("registrar_venda_como", {
    p_owner: ctx.owner,
    p_cliente_id: r.clienteId,
    p_cliente_nome: r.clienteNome,
    p_itens: r.itens,
    p_desconto: r.desconto,
    p_tipo_pagamento: r.tipo,
    p_forma_pagamento: r.formaNome,
    p_canal: r.canalNome,
    p_numero_parcelas: r.parcelas,
    p_primeiro_vencimento: r.primeiroVencimento,
    p_data: r.data,
    p_canal_id: r.canalId,
    p_forma_pagamento_id: r.formaId,
    p_outros_gastos: 0,
  });

  if (error) {
    console.error("[whatsapp] registrar_venda_como", error.message);
    await db.from("whatsapp_acoes").update({ status: "falhou", erro: error.message.slice(0, 300), resolvida_em: agora }).eq("id", acao.id);
    return `Não consegui lançar: ${mensagemDeErro(error)}`;
  }

  await db.from("whatsapp_acoes").update({ status: "executada", venda_id: vendaId, resolvida_em: agora }).eq("id", acao.id);

  // o mesmo aviso que o app manda quando a venda sai pela tela. Opcional: falhar aqui não desfaz a venda
  if (ctx.user) {
    try {
      const [{ data: venda }, { data: itensVenda }] = await Promise.all([
        db.from("vendas").select("custo_total").eq("id", vendaId).eq("owner_id", ctx.owner).single(),
        db.from("venda_itens").select("produto_nome, quantidade").eq("venda_id", vendaId).eq("owner_id", ctx.owner),
      ]);
      await avisarVenda(
        db,
        ctx.user,
        {
          vendaId: String(vendaId),
          data: r.data,
          valor: r.total,
          lucro: r.total - Number(venda?.custo_total ?? 0),
          cliente: r.clienteNome,
          canal: r.canalNome,
          itens: (itensVenda ?? []).map((i) => ({ nome: i.produto_nome, quantidade: i.quantidade })),
        },
        db,
      );
    } catch (erroAviso) {
      console.error("[whatsapp] aviso da venda", erroAviso);
    }
  }

  return `Venda lançada: ${formatBRL(r.total)}. Estoque e caixa já foram atualizados.`;
}
