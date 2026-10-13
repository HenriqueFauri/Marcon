import "server-only";
import { avisarVenda } from "@/lib/push/eventos";
import { formatBRL, formatData, hojeISO, somarDias } from "@/lib/format";
import { MINUTOS_DO_RASCUNHO, igual, r2, termo, type ContextoAcao, type Db, type Entrada } from "./rascunho";
import { umProduto } from "./produtos";
import type { Resultado } from "./acoes";

// Lançar venda pelo WhatsApp. REGRAS QUE NÃO PODEM QUEBRAR:
// 1) O modelo só PREPARA (preparar_venda grava um rascunho). Quem LANÇA é resolverPendente() em
//    acoes.ts, código do servidor que só roda quando a mensagem do vendedor é exatamente um SIM.
// 2) O rascunho guarda produto, variação, quantidade e preço já resolvidos: o SIM executa o que foi
//    mostrado, não o que o modelo entenderia de novo.
// 3) O texto de confirmação é montado aqui, não pelo modelo, para o valor mostrado ser o valor gravado.

export type ContextoVenda = ContextoAcao;

const DATA = /^\d{4}-\d{2}-\d{2}$/;

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
            preco_unitario: { type: "number", description: "Preço de CADA unidade em reais, só se o vendedor disse 'cada', 'a X cada' ou vendeu 1 unidade" },
            valor_total_item: {
              type: "number",
              description:
                "Valor TOTAL deste item em reais, quando o vendedor disse 'N por X' sem 'cada' (ex.: 'vendi 2 carregadores por 80' é valor_total_item 80). Use este campo OU preco_unitario, nunca os dois",
            },
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
  aproximado?: boolean; // algum produto foi achado por semelhança: exige o SIM (ver acoes.ts)
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
  let aproximado = false;

  for (const it of pedidos) {
    const quantidade = Math.trunc(Number(it.quantidade) || 1);
    if (quantidade < 1 || quantidade > 1000) return { erro: "Confira a quantidade vendida." };
    const t = termo(it.produto);
    if (!t) return { erro: "Faltou o nome do produto." };

    const achado = await umProduto(db, ctx.owner, t);
    if ("falta" in achado) return achado.falta;
    const p = achado.produto;
    // nome só parecido com o que foi dito: o vendedor precisa ver e confirmar, mesmo com o SIM dispensado
    if (!achado.firme) aproximado = true;

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

    // "2 por 80" é o total do item: o servidor divide, e só aceita se a conta fechar em centavos
    const totalDito = it.valor_total_item == null ? NaN : Number(it.valor_total_item);
    let dito = it.preco_unitario == null ? NaN : Number(it.preco_unitario);
    if (Number.isFinite(totalDito)) {
      if (totalDito < 0 || totalDito > 1_000_000) return { erro: "Confira o valor informado." };
      const porUnidade = r2(totalDito / quantidade);
      if (r2(porUnidade * quantidade) !== r2(totalDito)) {
        return { erro: `R$ ${totalDito} em ${quantidade} unidades não divide igual. Pergunte o valor de cada unidade.` };
      }
      dito = porUnidade;
    }
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
    aproximado,
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

// Executa o rascunho de venda. Só é chamada por resolverPendente() (acoes.ts), depois do SIM do
// vendedor e com a execução já reservada: nunca pelo modelo.
export async function executarVenda(db: Db, ctx: ContextoVenda, payload: unknown): Promise<Resultado> {
  const r = payload as Rascunho;
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

  if (error) throw error;

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

  return { vendaId: String(vendaId), mensagem: `Venda lançada: ${formatBRL(r.total)}. Estoque e caixa já foram atualizados.` };
}
