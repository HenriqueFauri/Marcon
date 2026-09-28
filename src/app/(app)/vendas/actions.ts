"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { enviarNotificacao } from "@/lib/push/send";

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

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
  const canalId = String(formData.get("canal_id") ?? "") || null;
  const canalManual = String(formData.get("canal_manual") ?? "").trim();
  const formaPagamentoId = String(formData.get("forma_pagamento_id") ?? "") || null;
  const formaPagamentoManual = String(formData.get("forma_pagamento_manual") ?? "").trim();
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

  let canalNome: string | null = canalManual || null;
  if (canalId) {
    const { data: canal } = await supabase.from("canais_venda").select("nome").eq("id", canalId).single();
    canalNome = canal?.nome ?? (canalManual || null);
  }

  let formaPagamentoNome: string | null = formaPagamentoManual || null;
  if (formaPagamentoId) {
    const { data: forma } = await supabase
      .from("formas_pagamento")
      .select("nome")
      .eq("id", formaPagamentoId)
      .single();
    formaPagamentoNome = forma?.nome ?? (formaPagamentoManual || null);
  }

  const { data: vendaId, error } = await supabase.rpc("registrar_venda", {
    p_cliente_id: clienteId,
    p_cliente_nome: clienteNome,
    p_itens: itens,
    p_desconto: Number(formData.get("desconto") ?? 0),
    p_tipo_pagamento: tipoPagamento,
    p_forma_pagamento: formaPagamentoNome,
    p_canal: canalNome,
    p_numero_parcelas: tipoPagamento === "a_prazo" ? numeroParcelas : 1,
    p_primeiro_vencimento: primeiroVencimento,
    p_data: new Date().toISOString().slice(0, 10),
    p_canal_id: canalId,
    p_forma_pagamento_id: formaPagamentoId,
  });
  if (error) throw error;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { data: venda } = await supabase.from("vendas").select("valor_total").eq("id", vendaId).single();
    const valor = venda?.valor_total ?? 0;
    enviarNotificacao(
      user.id,
      "Nova venda registrada",
      `${formatBRL(valor)}${clienteNome ? " — " + clienteNome : ""}`,
      "/vendas",
    ).catch(() => {});
  }

  revalidatePath("/vendas");
  revalidatePath("/produtos");
  revalidatePath("/fluxo-de-caixa");
  revalidatePath("/contas-a-receber");
  revalidatePath("/");
  redirect("/vendas");
}
