"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { enviarNotificacao } from "@/lib/push/send";
import { falha, ok, type ActionResult } from "@/lib/action";
import { hojeISO } from "@/lib/format";
import { renderizarModelo, resolverModelo } from "@/lib/notificacao-modelos";

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
  data: string | null;
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

    const hoje = hojeISO();
    const data = input.data && DATA_RE.test(input.data) ? input.data : hoje;
    const vencimento =
      input.primeiroVencimento && DATA_RE.test(input.primeiroVencimento) ? input.primeiroVencimento : data;

    const { data: vendaId, error } = await supabase.rpc("registrar_venda", {
      p_cliente_id: input.clienteId || null,
      p_cliente_nome: clienteNome,
      p_itens: itens,
      p_desconto: desconto,
      p_tipo_pagamento: aPrazo ? "a_prazo" : "a_vista",
      p_forma_pagamento: formaNome,
      p_canal: canalNome,
      p_numero_parcelas: parcelas,
      p_primeiro_vencimento: vencimento,
      p_data: data,
      p_canal_id: input.canalId || null,
      p_forma_pagamento_id: input.formaPagamentoId || null,
    });
    if (error) return falha(error);

    const total = subtotal - desconto;
    const modelo = resolverModelo(user.user_metadata);
    after(async () => {
      try {
        const { data: venda } = await supabase.from("vendas").select("custo_total").eq("id", vendaId).single();
        const { data: itensVenda } = await supabase
          .from("venda_itens")
          .select("produto_nome, quantidade")
          .eq("venda_id", vendaId);
        const { titulo, corpo } = renderizarModelo(modelo.titulo, modelo.corpo, {
          valor: total,
          lucro: total - Number(venda?.custo_total ?? 0),
          desconto,
          cliente: clienteNome,
          canal: canalNome,
          formaPagamento: formaNome,
          itens: (itensVenda ?? []).map((i) => ({ nome: i.produto_nome, quantidade: i.quantidade })),
        });
        await enviarNotificacao(user.id, titulo, corpo, `/vendas/${vendaId}`);
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
    const { error } = await supabase.rpc("cancelar_venda", { p_venda_id: vendaId });
    if (error) return falha(error);
    revalidarVendas();
    revalidatePath(`/vendas/${vendaId}`);
    return ok("Venda cancelada. Estoque devolvido e valores estornados.");
  } catch (e) {
    return falha(e);
  }
}
