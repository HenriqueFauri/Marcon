import { createClient } from "@/lib/supabase/server";

// Dados do recibo público (função recibo_publico, migration 0017): só o que o cliente deve ver.

export interface Recibo {
  empresa: {
    nome: string | null;
    telefone: string | null;
    email: string | null;
    endereco: string | null;
    documento: string | null;
    logo_path: string | null;
  };
  venda: {
    data: string;
    cliente_nome: string | null;
    tipo_pagamento: "a_vista" | "a_prazo";
    forma_pagamento: string | null;
    valor_total: number;
    desconto: number;
    status: "concluida" | "cancelada";
  };
  itens: { nome: string; quantidade: number; preco_unitario: number }[];
  parcelas: {
    numero: number;
    vencimento: string;
    valor: number;
    status: "pendente" | "pago" | "atrasado";
    data_pagamento: string | null;
  }[];
}

export const TOKEN_RECIBO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function buscarRecibo(token: string): Promise<Recibo | null> {
  if (!TOKEN_RECIBO.test(token)) return null;
  const supabase = await createClient();
  const { data } = await supabase.rpc("recibo_publico", { p_token: token });
  return (data as Recibo | null) ?? null;
}

export function totaisDoRecibo(r: Recibo) {
  const subtotal = r.itens.reduce((s, i) => s + i.quantidade * Number(i.preco_unitario), 0);
  const pago = r.parcelas.filter((p) => p.status === "pago").reduce((s, p) => s + Number(p.valor), 0);
  return { subtotal, pago, emAberto: Number(r.venda.valor_total) - pago };
}
