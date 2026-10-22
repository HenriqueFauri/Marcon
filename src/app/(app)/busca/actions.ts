"use server";

import { createClient } from "@/lib/supabase/server";
import { formatBRL, formatDataCurta } from "@/lib/format";

export interface ResultadoBusca {
  produtos: { id: string; titulo: string; detalhe: string }[];
  clientes: { id: string; titulo: string; detalhe: string }[];
  vendas: { id: string; titulo: string; detalhe: string }[];
}

const LIMITE = 5;

// Busca única do app: produto, cliente e venda. Roda com a sessão da pessoa, então
// o RLS já limita tudo à conta dela; o termo perde os caracteres que o filtro .or() interpreta.
export async function buscarGeral(texto: string): Promise<ResultadoBusca> {
  const vazio: ResultadoBusca = { produtos: [], clientes: [], vendas: [] };
  const q = String(texto ?? "").trim().slice(0, 60);
  if (q.length < 2) return vazio;
  const termo = `%${q.replace(/[%_,()*\\]/g, " ")}%`;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return vazio;

  const [produtos, clientes, vendasPorCliente, itens] = await Promise.all([
    supabase
      .from("produtos_com_estoque")
      .select("id, nome, sku, preco_varejo, estoque_atual")
      .neq("status", "inativo")
      .or(`nome.ilike.${termo},sku.ilike.${termo},marca.ilike.${termo}`)
      .order("nome")
      .limit(LIMITE),
    supabase
      .from("clientes")
      .select("id, nome, telefone")
      .or(`nome.ilike.${termo},telefone.ilike.${termo},email.ilike.${termo}`)
      .order("nome")
      .limit(LIMITE),
    supabase.from("vendas").select("id").ilike("cliente_nome", termo).order("data", { ascending: false }).limit(LIMITE),
    supabase.from("venda_itens").select("venda_id").ilike("produto_nome", termo).limit(LIMITE * 2),
  ]);

  const ids = [...new Set([...(vendasPorCliente.data ?? []).map((v) => v.id), ...(itens.data ?? []).map((i) => i.venda_id)])];
  const vendas = ids.length
    ? await supabase
        .from("vendas")
        .select("id, cliente_nome, data, valor_total, status")
        .in("id", ids)
        .order("data", { ascending: false })
        .limit(LIMITE)
    : { data: [] };

  return {
    produtos: (produtos.data ?? []).map((p) => ({
      id: p.id,
      titulo: p.nome,
      detalhe: `${formatBRL(Number(p.preco_varejo))} · ${Number(p.estoque_atual)} em estoque`,
    })),
    clientes: (clientes.data ?? []).map((c) => ({ id: c.id, titulo: c.nome, detalhe: c.telefone ?? "" })),
    vendas: (vendas.data ?? []).map((v) => ({
      id: v.id,
      titulo: v.cliente_nome || "Venda sem cliente",
      detalhe: `${formatDataCurta(v.data)} · ${formatBRL(Number(v.valor_total))}${v.status === "cancelada" ? " · cancelada" : ""}`,
    })),
  };
}
