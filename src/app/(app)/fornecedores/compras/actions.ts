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
  // a prazo: não sai do caixa agora; vira contas a pagar mensais
  a_prazo?: boolean;
  parcelas?: number;
  primeiro_vencimento?: string;
}

const DATA = /^\d{4}-\d{2}-\d{2}$/;

// Registra a compra de vários itens com frete: o banco rateia o frete no custo de cada entrada de
// estoque e lança uma saída só no caixa (função registrar_pedido_compra, migrations 0057 e 0066).
// A prazo: estoque e custo entram igual, mas no lugar da saída o banco abre as contas a pagar.
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
    const data = DATA.test(dados.data) ? dados.data : hojeISO();
    const aPrazo = dados.a_prazo === true;
    let parcelas = 1;
    let primeiroVencimento: string | null = null;
    if (aPrazo) {
      parcelas = Number(dados.parcelas);
      if (!Number.isInteger(parcelas) || parcelas < 1 || parcelas > 12) return { ok: false, error: "Escolha de 1 a 12 parcelas." };
      if (!dados.primeiro_vencimento || !DATA.test(dados.primeiro_vencimento))
        return { ok: false, error: "Escolha a data do primeiro vencimento." };
      if (dados.primeiro_vencimento < data) return { ok: false, error: "O primeiro vencimento não pode ser antes da data da compra." };
      primeiroVencimento = dados.primeiro_vencimento;
    }

    const supabase = await createClient();
    const { error } = await supabase.rpc("registrar_pedido_compra", {
      p_fornecedor_id: dados.fornecedor_id || null,
      p_data: data,
      p_frete: dados.frete,
      p_itens: dados.itens.map((i) => ({
        produto_id: i.produto_id,
        variacao_id: i.variacao_id || null,
        quantidade: i.quantidade,
        valor_unitario: i.valor_unitario,
      })),
      p_observacoes: dados.observacoes.trim() || null,
      p_a_prazo: aPrazo,
      p_parcelas: parcelas,
      p_primeiro_vencimento: primeiroVencimento,
    });
    if (error) return falha(error);

    revalidatePath("/fornecedores/compras");
    revalidatePath("/fornecedores/reposicao");
    revalidatePath("/produtos", "layout");
    revalidatePath("/fluxo-de-caixa");
    revalidatePath("/");
    if (aPrazo) {
      revalidatePath("/contas-a-pagar");
      return ok(`Compra registrada. O estoque já entrou e ${parcelas === 1 ? "a conta foi" : `as ${parcelas} parcelas foram`} pra A pagar.`);
    }
    return ok("Compra registrada. O estoque e o custo já foram atualizados.");
  } catch (e) {
    return falha(e);
  }
}
