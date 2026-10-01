"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { falha, ok, type ActionResult } from "@/lib/action";
import { limiteDeProdutos } from "@/lib/limites";
import type { LancamentoLido, ProdutoLido, VendaLida } from "@/lib/importacao/tipos";

// Grava o que o usuário conferiu na prévia. As funções do banco fazem tudo ou nada,
// não duplicam (produto de mesmo nome é pulado; vendas e lançamentos têm referência
// de origem) e as vendas entram como histórico, sem mexer no estoque.

const MAX_LINHAS = 2000;

function numero(v: unknown) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0;
}

function inteiro(v: unknown) {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function texto(v: unknown, max = 200) {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

const DATA = /^\d{4}-\d{2}-\d{2}$/;

async function chamar(funcao: string, argumento: string, itens: unknown[]) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { erro: new Error("Sua sessão expirou. Entre novamente.") };
  const { data, error } = await supabase.rpc(funcao, { [argumento]: itens });
  if (error) return { erro: error };
  return { dados: data as Record<string, number> };
}

function plural(n: number, um: string, varios: string) {
  return `${n} ${n === 1 ? um : varios}`;
}

export async function importarProdutos(produtos: ProdutoLido[]): Promise<ActionResult> {
  try {
    if (!Array.isArray(produtos) || produtos.length === 0) return { ok: false, error: "Nenhum produto selecionado." };
    if (produtos.length > MAX_LINHAS) return { ok: false, error: `No máximo ${MAX_LINHAS} produtos por vez.` };

    const itens = produtos
      .map((p) => ({
        nome: texto(p.nome),
        categoria: texto(p.categoria, 100) || null,
        custo: numero(p.custo),
        preco_varejo: numero(p.precoVarejo),
        preco_atacado: p.precoAtacado == null ? null : numero(p.precoAtacado),
        estoque: inteiro(p.estoque),
      }))
      .filter((p) => p.nome);
    if (itens.length === 0) return { ok: false, error: "Nenhum produto com nome." };

    // conta todos, inclusive os que serão pulados por já existirem: é só uma trava de segurança
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Sua sessão expirou. Entre novamente." };
    const limite = await limiteDeProdutos(supabase, user, itens.length);
    if (limite) return { ok: false, error: `${limite} Desmarque alguns produtos na prévia ou assine para importar todos.` };

    const r = await chamar("importar_produtos", "p_itens", itens);
    if ("erro" in r) return falha(r.erro);

    revalidatePath("/produtos");
    revalidatePath("/");
    const { criados = 0, ignorados = 0 } = r.dados;
    return ok(
      `${plural(criados, "produto importado", "produtos importados")}.` +
        (ignorados ? ` ${plural(ignorados, "já existia", "já existiam")} e foram pulados.` : ""),
    );
  } catch (e) {
    return falha(e);
  }
}

export async function importarVendas(vendas: VendaLida[]): Promise<ActionResult> {
  try {
    if (!Array.isArray(vendas) || vendas.length === 0) return { ok: false, error: "Nenhuma venda selecionada." };
    if (vendas.length > MAX_LINHAS) return { ok: false, error: `No máximo ${MAX_LINHAS} vendas por vez.` };

    const itens = [];
    for (const v of vendas) {
      if (v.aPrazo) continue; // as parcelas não vêm no relatório
      const ref = texto(v.ref);
      if (!ref || !DATA.test(v.data) || !Array.isArray(v.itens) || v.itens.length === 0) continue;
      itens.push({
        ref,
        data: v.data,
        total: numero(v.total),
        custo_total: numero(v.custoTotal),
        forma_pagamento: texto(v.formaPagamento, 100) || null,
        canal: texto(v.canal, 100) || null,
        cliente_nome: texto(v.cliente) || null,
        itens: v.itens.map((i) => {
          const quantidade = Math.max(inteiro(i.quantidade), 1);
          return {
            nome: texto(i.nome),
            nome_base: texto(i.nomeBase),
            variacao: texto(i.variacao) || null,
            quantidade,
            preco_unitario: numero(i.total / quantidade),
            custo_unitario: numero(i.custoUnitario),
          };
        }),
      });
    }
    if (itens.length === 0) return { ok: false, error: "Nenhuma venda válida para importar." };

    const r = await chamar("importar_vendas", "p_vendas", itens);
    if ("erro" in r) return falha(r.erro);

    revalidatePath("/vendas");
    revalidatePath("/fluxo-de-caixa");
    revalidatePath("/clientes");
    revalidatePath("/");
    const { criadas = 0, ignoradas = 0, itens_sem_produto = 0 } = r.dados;
    return ok(
      `${plural(criadas, "venda importada", "vendas importadas")}.` +
        (ignoradas ? ` ${plural(ignoradas, "já estava", "já estavam")} no Marcon e foram puladas.` : "") +
        (itens_sem_produto
          ? ` ${plural(itens_sem_produto, "item ficou", "itens ficaram")} sem ligação com um produto: importe os produtos primeiro, se ainda não fez.`
          : ""),
    );
  } catch (e) {
    return falha(e);
  }
}

export async function importarLancamentos(lancamentos: LancamentoLido[]): Promise<ActionResult> {
  try {
    if (!Array.isArray(lancamentos) || lancamentos.length === 0) return { ok: false, error: "Nenhum lançamento selecionado." };
    if (lancamentos.length > MAX_LINHAS) return { ok: false, error: `No máximo ${MAX_LINHAS} lançamentos por vez.` };

    const itens = lancamentos
      .filter((l) => texto(l.ref) && DATA.test(l.data) && (l.tipo === "entrada" || l.tipo === "saida") && numero(l.valor) > 0)
      .map((l) => ({
        ref: texto(l.ref, 400),
        data: l.data,
        tipo: l.tipo,
        origem: l.origem === "compra" ? "compra" : "manual",
        categoria: texto(l.categoria, 100) || "Outros",
        descricao: texto(l.descricao, 300),
        valor: numero(l.valor),
        produto_nome: texto(l.produtoNome) || null,
      }));
    if (itens.length === 0) return { ok: false, error: "Nenhum lançamento válido para importar." };

    const r = await chamar("importar_lancamentos", "p_itens", itens);
    if ("erro" in r) return falha(r.erro);

    revalidatePath("/fluxo-de-caixa");
    revalidatePath("/");
    const { criados = 0, ignorados = 0 } = r.dados;
    return ok(
      `${plural(criados, "lançamento importado", "lançamentos importados")}.` +
        (ignorados ? ` ${plural(ignorados, "já estava", "já estavam")} no Marcon e foram pulados.` : ""),
    );
  } catch (e) {
    return falha(e);
  }
}
