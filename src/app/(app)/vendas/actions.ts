"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

interface ItemCarrinho {
  produto_id: string;
  quantidade: number;
  preco_unitario: number;
}

export async function registrarVenda(formData: FormData) {
  const supabase = await createClient();

  const itensRaw = String(formData.get("itens") ?? "[]");
  const itens: ItemCarrinho[] = JSON.parse(itensRaw);
  if (itens.length === 0) throw new Error("adicione pelo menos um produto");

  const clienteId = String(formData.get("cliente_id") ?? "") || null;
  const clienteNomeManual = String(formData.get("cliente_nome_manual") ?? "").trim();
  const tipoPagamento = String(formData.get("tipo_pagamento") ?? "a_vista");
  const numeroParcelas = Number(formData.get("numero_parcelas") ?? 1);
  const primeiroVencimento = String(
    formData.get("primeiro_vencimento") || new Date().toISOString().slice(0, 10),
  );

  let clienteNome: string | null = clienteNomeManual || null;
  if (clienteId) {
    const { data: cliente } = await supabase.from("clientes").select("nome").eq("id", clienteId).single();
    clienteNome = cliente?.nome ?? (clienteNomeManual || null);
  }

  const { error } = await supabase.rpc("registrar_venda", {
    p_cliente_id: clienteId,
    p_cliente_nome: clienteNome,
    p_itens: itens,
    p_desconto: Number(formData.get("desconto") ?? 0),
    p_tipo_pagamento: tipoPagamento,
    p_forma_pagamento: String(formData.get("forma_pagamento") ?? "").trim() || null,
    p_canal: String(formData.get("canal") ?? "").trim() || null,
    p_numero_parcelas: tipoPagamento === "a_prazo" ? numeroParcelas : 1,
    p_primeiro_vencimento: primeiroVencimento,
    p_data: new Date().toISOString().slice(0, 10),
  });
  if (error) throw error;

  revalidatePath("/vendas");
  revalidatePath("/produtos");
  revalidatePath("/fluxo-de-caixa");
  revalidatePath("/contas-a-receber");
  revalidatePath("/");
  redirect("/vendas");
}
