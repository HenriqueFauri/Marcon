"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { falha, numero, ok, texto, type ActionResult } from "@/lib/action";
import { hojeISO } from "@/lib/format";

export async function criarLancamentoManual(formData: FormData): Promise<ActionResult> {
  try {
    const tipo = texto(formData, "tipo");
    const descricao = texto(formData, "descricao");
    const valor = numero(formData, "valor");
    const categoria = texto(formData, "categoria") || "Outros";
    const dataBruta = texto(formData, "data");
    const data = /^\d{4}-\d{2}-\d{2}$/.test(dataBruta) ? dataBruta : hojeISO();

    if (tipo !== "entrada" && tipo !== "saida") return { ok: false, error: "Escolha entrada ou saída." };
    if (!descricao) return { ok: false, error: "A descrição é obrigatória." };
    if (valor === null || !(valor > 0)) return { ok: false, error: "O valor precisa ser maior que zero." };

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Sua sessão expirou. Entre novamente." };

    const { error } = await supabase.from("lancamentos_caixa").insert({
      owner_id: user.id,
      tipo,
      origem: "manual",
      categoria,
      descricao,
      valor: Math.round(valor * 100) / 100,
      data,
      afeta_lucro: true,
      afeta_caixa: true,
    });
    if (error) return falha(error);

    revalidatePath("/fluxo-de-caixa");
    revalidatePath("/");
    return ok(tipo === "entrada" ? "Entrada lançada." : "Saída lançada.");
  } catch (e) {
    return falha(e);
  }
}

export async function excluirLancamento(id: string): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    // só lançamentos manuais: os automáticos (vendas, parcelas, compras de
    // estoque) são desfeitos pela ação de origem, senão o caixa desencontra do resto
    const { data: lancamento } = await supabase
      .from("lancamentos_caixa")
      .select("venda_id, parcela_id, movimento_estoque_id")
      .eq("id", id)
      .single();
    if (lancamento && (lancamento.venda_id || lancamento.parcela_id || lancamento.movimento_estoque_id)) {
      return {
        ok: false,
        error: "Esse lançamento foi gerado automaticamente. Cancele a venda ou ajuste o estoque na origem.",
      };
    }

    const { error } = await supabase.from("lancamentos_caixa").delete().eq("id", id);
    if (error) return falha(error);

    revalidatePath("/fluxo-de-caixa");
    revalidatePath("/");
    return ok("Lançamento excluído.");
  } catch (e) {
    return falha(e);
  }
}
