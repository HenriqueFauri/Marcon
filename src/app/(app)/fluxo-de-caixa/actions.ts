"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { LancamentoTipo } from "@/types/domain";

export async function criarLancamentoManual(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("não autenticado");

  const tipo = String(formData.get("tipo")) as LancamentoTipo;
  const descricao = String(formData.get("descricao") ?? "").trim();
  const valor = Number(formData.get("valor"));
  const categoria = String(formData.get("categoria") ?? "Outros").trim() || "Outros";
  const data = String(formData.get("data") || new Date().toISOString().slice(0, 10));

  if (!descricao) throw new Error("descrição é obrigatória");
  if (!(valor > 0)) throw new Error("valor precisa ser maior que zero");

  const { error } = await supabase.from("lancamentos_caixa").insert({
    owner_id: user.id,
    tipo,
    origem: "manual",
    categoria,
    descricao,
    valor,
    data,
    afeta_lucro: true,
    afeta_caixa: true,
  });
  if (error) throw error;

  revalidatePath("/fluxo-de-caixa");
  revalidatePath("/");
}

export async function excluirLancamento(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("lancamentos_caixa").delete().eq("id", id);
  if (error) throw error;

  revalidatePath("/fluxo-de-caixa");
  revalidatePath("/");
}
