"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { avisarVenda } from "@/lib/push/eventos";
import { falha, ok, type ActionResult } from "@/lib/action";
import { formatBRL, hojeISO } from "@/lib/format";

export interface NovaVendaInput {
  itens: { produto_id: string; variacao_id: string | null; quantidade: number; preco_unitario: number }[];
  clienteId: string | null;
  clienteNome: string | null;
  canalId: string | null;
  canalNome: string | null;
  formaPagamentoId: string | null;
  formaPagamentoNome: string | null;
  tipoPagamento: "a_vista" | "a_prazo";
  numeroParcelas: number;
  primeiroVencimento: string | null;
  desconto: number;
  entrada?: number; // paga na hora, só em venda a prazo: entra no caixa agora e o resto vira parcelas
  outrosGastos: number; // motoboy, embalagem...: custo do lojista nesta venda
  data: string | null;
  pedidoId?: string | null; // pedido da vitrine que virou esta venda
}

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;

function revalidarVendas() {
  revalidatePath("/vendas");
  revalidatePath("/produtos");
  revalidatePath("/fluxo-de-caixa");
  revalidatePath("/contas-a-receber");
  revalidatePath("/clientes");
  revalidatePath("/");
}

export async function registrarVenda(input: NovaVendaInput): Promise<ActionResult> {
  try {
    const itens = (input.itens ?? []).filter((i) => i.quantidade > 0);
    if (itens.length === 0) return { ok: false, error: "Adicione pelo menos um produto." };
    if (itens.some((i) => !Number.isInteger(i.quantidade) || !(i.preco_unitario >= 0))) {
      return { ok: false, error: "Confira as quantidades e os preços dos itens." };
    }
    const desconto = Number(input.desconto) || 0;
    if (desconto < 0) return { ok: false, error: "O desconto não pode ser negativo." };
    const subtotal = itens.reduce((s, i) => s + i.quantidade * i.preco_unitario, 0);
    if (desconto > subtotal) return { ok: false, error: "O desconto é maior que o total da venda." };
    const outrosGastos = Math.round((Number(input.outrosGastos) || 0) * 100) / 100;
    if (outrosGastos < 0) return { ok: false, error: "Os outros gastos não podem ser negativos." };

    const aPrazo = input.tipoPagamento === "a_prazo";
    const parcelas = aPrazo ? Math.trunc(Number(input.numeroParcelas) || 1) : 1;
    if (parcelas < 1 || parcelas > 60) return { ok: false, error: "Número de parcelas entre 1 e 60." };

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Sua sessão expirou. Entre novamente." };

    // nomes viram snapshot na venda: resolve a partir do cadastro quando houver
    const [cliente, canal, forma] = await Promise.all([
      input.clienteId
        ? supabase.from("clientes").select("nome").eq("id", input.clienteId).single()
        : Promise.resolve({ data: null }),
      input.canalId
        ? supabase.from("canais_venda").select("nome").eq("id", input.canalId).single()
        : Promise.resolve({ data: null }),
      input.formaPagamentoId
        ? supabase.from("formas_pagamento").select("nome").eq("id", input.formaPagamentoId).single()
        : Promise.resolve({ data: null }),
    ]);

    const clienteNome = cliente.data?.nome ?? (input.clienteNome?.trim() || null);
    const canalNome = canal.data?.nome ?? (input.canalNome?.trim() || null);
    const formaNome = forma.data?.nome ?? (input.formaPagamentoNome?.trim() || null);

    if (aPrazo && !clienteNome) {
      return { ok: false, error: "Venda a prazo precisa de um cliente, pra saber de quem cobrar." };
    }

    const entrada = aPrazo ? Math.round((Number(input.entrada) || 0) * 100) / 100 : 0;
    if (entrada < 0) return { ok: false, error: "A entrada não pode ser negativa." };
    if (entrada > 0 && entrada >= subtotal - desconto) {
      return { ok: false, error: "A entrada precisa ser menor que o total. Se o cliente pagou tudo, registre à vista." };
    }

    const hoje = hojeISO();
    const data = input.data && DATA_RE.test(input.data) ? input.data : hoje;
    const vencimento =
      input.primeiroVencimento && DATA_RE.test(input.primeiroVencimento) ? input.primeiroVencimento : data;

    // com entrada, a função própria faz venda, entrada no caixa e parcelas do resto numa transação só
    const comum = {
      p_cliente_id: input.clienteId || null,
      p_cliente_nome: clienteNome,
      p_itens: itens,
      p_desconto: desconto,
      p_forma_pagamento: formaNome,
      p_canal: canalNome,
      p_numero_parcelas: parcelas,
      p_primeiro_vencimento: vencimento,
      p_data: data,
      p_canal_id: input.canalId || null,
      p_forma_pagamento_id: input.formaPagamentoId || null,
      // só manda quando há gasto: o banco ainda sem a migration 0018 segue registrando vendas normais
      ...(outrosGastos > 0 ? { p_outros_gastos: outrosGastos } : {}),
    };
    const { data: vendaId, error } =
      entrada > 0
        ? await supabase.rpc("registrar_venda_com_entrada", { ...comum, p_entrada: entrada })
        : await supabase.rpc("registrar_venda", { ...comum, p_tipo_pagamento: aPrazo ? "a_prazo" : "a_vista" });
    if (error) return falha(error);

    // pedido da vitrine que virou esta venda: sai dos novos e guarda o vínculo
    if (input.pedidoId) {
      await supabase
        .from("vitrine_pedidos")
        .update({ status: "vendido", venda_id: vendaId })
        .eq("id", input.pedidoId)
        .eq("status", "novo");
      revalidatePath("/vitrine", "layout");
    }

    const total = subtotal - desconto;
    after(async () => {
      try {
        const { data: venda } = await supabase.from("vendas").select("custo_total").eq("id", vendaId).single();
        const { data: itensVenda } = await supabase
          .from("venda_itens")
          .select("produto_nome, quantidade")
          .eq("venda_id", vendaId);
        await avisarVenda(supabase, user, {
          vendaId: String(vendaId),
          data,
          valor: total,
          lucro: total - Number(venda?.custo_total ?? 0),
          cliente: clienteNome,
          canal: canalNome,
          itens: (itensVenda ?? []).map((i) => ({ nome: i.produto_nome, quantidade: i.quantidade })),
        });
      } catch {
        // aviso é opcional: falhar aqui não pode afetar a venda já registrada
      }
    });

    revalidarVendas();
    return { ok: true, message: "Venda registrada!", id: String(vendaId) };
  } catch (e) {
    return falha(e);
  }
}

export async function cancelarVenda(vendaId: string): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("cancelar_venda", { p_venda_id: vendaId });
    if (error) return falha(error);
    revalidarVendas();
    revalidatePath(`/vendas/${vendaId}`);

    // a função diz o que fez com o estoque; sem resumo (banco antigo), vale o aviso de sempre
    const r = data as { devolvidos?: number; sem_ligacao?: number; sem_variacao?: number } | null;
    if (!r || typeof r !== "object") return ok("Venda cancelada. Estoque devolvido e valores estornados.");
    const devolvidos = r.devolvidos ?? 0;
    const naoVoltaram = (r.sem_ligacao ?? 0) + (r.sem_variacao ?? 0);
    const voltou = devolvidos ? ` ${devolvidos} ${devolvidos === 1 ? "item voltou" : "itens voltaram"} ao estoque.` : "";
    const aviso = naoVoltaram
      ? ` Atenção: ${naoVoltaram} ${naoVoltaram === 1 ? "item não voltou" : "itens não voltaram"} ao estoque porque ${naoVoltaram === 1 ? "não está ligado" : "não estão ligados"} a um produto ou variação. Use Ajustar no produto para corrigir o estoque.`
      : "";
    return ok(`Venda cancelada. Valores estornados no caixa.${voltou}${aviso}`);
  } catch (e) {
    return falha(e);
  }
}

// troca o código do recibo: o link mandado antes para de abrir
export async function novoLinkRecibo(vendaId: string): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("novo_link_recibo", { p_venda_id: vendaId });
    if (error) return falha(error);
    revalidatePath(`/vendas/${vendaId}`);
    return ok("Link novo criado. O anterior parou de funcionar.");
  } catch (e) {
    return falha(e);
  }
}

export interface EditarVendaInput {
  vendaId: string;
  clienteId: string | null;
  clienteNome: string | null;
  canalId: string | null;
  canalNome: string | null;
  formaPagamentoId: string | null;
  formaPagamentoNome: string | null;
  data: string;
  observacoes: string | null;
  // só os itens que mudaram de preço
  precos: { item_id: string; preco_unitario: number }[];
}

// corrige cliente, canal, forma, data, observação e preço dos itens; estoque e custo não mudam
export async function editarVenda(input: EditarVendaInput): Promise<ActionResult> {
  try {
    if (!DATA_RE.test(input.data)) return { ok: false, error: "Confira a data da venda." };
    if (input.precos.some((p) => !(p.preco_unitario >= 0))) return { ok: false, error: "Confira os preços dos itens." };
    const supabase = await createClient();
    const { error } = await supabase.rpc("editar_venda", {
      p_venda_id: input.vendaId,
      p_cliente_id: input.clienteId || null,
      p_cliente_nome: input.clienteNome?.trim() || null,
      p_canal_id: input.canalId || null,
      p_canal: input.canalNome?.trim() || null,
      p_forma_pagamento_id: input.formaPagamentoId || null,
      p_forma_pagamento: input.formaPagamentoNome?.trim() || null,
      p_data: input.data,
      p_observacoes: input.observacoes?.trim() || null,
      p_precos: input.precos.length ? input.precos : null,
    });
    if (error) return falha(error);
    revalidarVendas();
    revalidatePath(`/vendas/${input.vendaId}`);
    return ok("Venda atualizada.");
  } catch (e) {
    return falha(e);
  }
}

// devolve parte (ou toda a quantidade) de um item: estoque, caixa, parcelas e total acompanham
export async function devolverItemVenda(
  vendaId: string,
  itemId: string,
  quantidade: number,
  voltarEstoque: boolean,
): Promise<ActionResult> {
  try {
    if (!Number.isInteger(quantidade) || quantidade < 1) return { ok: false, error: "Informe a quantidade a devolver." };
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("devolver_item_venda", {
      p_item_id: itemId,
      p_quantidade: quantidade,
      p_voltar_estoque: voltarEstoque,
    });
    if (error) return falha(error);
    revalidarVendas();
    revalidatePath(`/vendas/${vendaId}`);
    const r = data as { devolvido?: number; estoque?: string } | null;
    const valor = formatBRL(Number(r?.devolvido ?? 0));
    const aviso =
      r?.estoque === "sem_ligacao" || r?.estoque === "sem_variacao"
        ? " Atenção: o item não está ligado a um produto ou variação, então o estoque não voltou. Use Ajustar no produto."
        : r?.estoque === "voltou"
          ? " O item voltou ao estoque."
          : "";
    return ok(`Devolução registrada: ${valor} estornados.${aviso}`);
  } catch (e) {
    return falha(e);
  }
}
