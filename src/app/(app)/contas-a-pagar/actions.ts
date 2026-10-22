"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { falha, numero, ok, texto, textoOuNull, type ActionResult } from "@/lib/action";
import { hojeISO } from "@/lib/format";

const DATA = /^\d{4}-\d{2}-\d{2}$/;

function revalidar() {
  revalidatePath("/contas-a-pagar");
  revalidatePath("/fluxo-de-caixa");
  revalidatePath("/");
}

function lerConta(formData: FormData) {
  const descricao = texto(formData, "descricao");
  const valor = numero(formData, "valor");
  const vencimento = texto(formData, "vencimento");
  const categoria = texto(formData, "categoria") || "Contas";

  if (!descricao) return { erro: "Diga o que é a conta (ex.: Aluguel)." } as const;
  if (descricao.length > 120) return { erro: "A descrição está grande demais." } as const;
  if (categoria.length > 60) return { erro: "A categoria está grande demais." } as const;
  if (valor === null || Number.isNaN(valor) || valor <= 0) return { erro: "Informe o valor da conta." } as const;
  if (!DATA.test(vencimento)) return { erro: "Informe o vencimento." } as const;

  return {
    campos: {
      descricao,
      valor,
      vencimento,
      dia_base: Number(vencimento.slice(8, 10)),
      recorrencia: formData.get("recorrencia") !== null ? "mensal" : "nenhuma",
      categoria,
      fornecedor_id: textoOuNull(formData, "fornecedor_id"),
    },
  } as const;
}

export async function criarConta(formData: FormData): Promise<ActionResult> {
  try {
    const lido = lerConta(formData);
    if ("erro" in lido) return { ok: false, error: lido.erro! };

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Sua sessão expirou. Entre novamente." };

    const { error } = await supabase.from("contas_a_pagar").insert({ owner_id: user.id, ...lido.campos });
    if (error) return falha(error);

    revalidar();
    return ok();
  } catch (e) {
    return falha(e);
  }
}

export async function atualizarConta(id: string, formData: FormData): Promise<ActionResult> {
  try {
    const lido = lerConta(formData);
    if ("erro" in lido) return { ok: false, error: lido.erro! };

    const supabase = await createClient();
    const { data, error } = await supabase.from("contas_a_pagar").update(lido.campos).eq("id", id).select("id");
    if (error) return falha(error);
    if (!data?.length) return { ok: false, error: "Conta não encontrada ou já paga." };

    revalidar();
    return ok();
  } catch (e) {
    return falha(e);
  }
}

export async function pagarConta(id: string, data: string): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { data: proxima, error } = await supabase.rpc("pagar_conta", {
      p_conta_id: id,
      p_data: DATA.test(data) ? data : hojeISO(),
    });
    if (error) return falha(error);

    revalidar();
    return ok(proxima ? "Conta paga. A do mês que vem já está na lista." : "Conta paga e lançada no caixa.");
  } catch (e) {
    return falha(e);
  }
}

export async function excluirConta(id: string): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("contas_a_pagar").delete().eq("id", id);
    if (error) return falha(error);

    revalidar();
    return ok();
  } catch (e) {
    return falha(e);
  }
}
