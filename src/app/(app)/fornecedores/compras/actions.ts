"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { falha, ok, type ActionResult } from "@/lib/action";
import { hojeISO } from "@/lib/format";

export interface ItemPedido {
  produto_id: string;
  variacao_id: string | null;
  quantidade: number;
  valor_unitario: number;
}

export interface DadosPedido {
  fornecedor_id: string | null;
  data: string;
  frete: number;
  observacoes: string;
  itens: ItemPedido[];
}

// Registra a compra de vários itens com frete: o banco rateia o frete no custo de cada entrada de
// estoque e lança uma saída só no caixa (função registrar_pedido_compra, migration 0057).
export async function registrarPedidoCompra(dados: DadosPedido): Promise<ActionResult> {
  try {
    if (!Array.isArray(dados.itens) || dados.itens.length === 0) return { ok: false, error: "Adicione pelo menos um item." };
    if (dados.itens.length > 100) return { ok: false, error: "O pedido aceita até 100 itens." };
    if (!Number.isFinite(dados.frete) || dados.frete < 0) return { ok: false, error: "Confira o valor do frete." };
    for (const i of dados.itens) {
      if (!i.produto_id) return { ok: false, error: "Escolha o produto de cada linha." };
      if (!Number.isInteger(i.quantidade) || i.quantidade <= 0)
        return { ok: false, error: "A quantidade de cada item precisa ser um número inteiro maior que zero." };
      if (!Number.isFinite(i.valor_unitario) || i.valor_unitario < 0)
        return { ok: false, error: "Confira o preço de cada item." };
    }

    const supabase = await createClient();
    const { error } = await supabase.rpc("registrar_pedido_compra", {
      p_fornecedor_id: dados.fornecedor_id || null,
      p_data: /^\d{4}-\d{2}-\d{2}$/.test(dados.data) ? dados.data : hojeISO(),
      p_frete: dados.frete,
      p_itens: dados.itens.map((i) => ({
        produto_id: i.produto_id,
        variacao_id: i.variacao_id || null,
        quantidade: i.quantidade,
        valor_unitario: i.valor_unitario,
      })),
      p_observacoes: dados.observacoes.trim() || null,
    });
    if (error) return falha(error);

    revalidatePath("/fornecedores/compras");
    revalidatePath("/fornecedores/reposicao");
    revalidatePath("/produtos", "layout");
    revalidatePath("/fluxo-de-caixa");
    revalidatePath("/");
    return ok("Compra registrada. O estoque e o custo já foram atualizados.");
  } catch (e) {
    return falha(e);
  }
}
