"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function criarProduto(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("não autenticado");

  const nome = String(formData.get("nome") ?? "").trim();
  if (!nome) throw new Error("nome é obrigatório");

  const categoriaNome = String(formData.get("categoria") ?? "").trim();
  let categoriaId: string | null = null;
  if (categoriaNome) {
    const { data: categoria, error } = await supabase
      .from("categorias")
      .upsert({ owner_id: user.id, nome: categoriaNome }, { onConflict: "owner_id,nome" })
      .select("id")
      .single();
    if (error) throw error;
    categoriaId = categoria.id;
  }

  const custo = Number(formData.get("custo") ?? 0);
  const precoVarejo = Number(formData.get("preco_varejo") ?? 0);
  const precoAtacadoRaw = formData.get("preco_atacado");
  const estoqueInicial = Number(formData.get("estoque_inicial") ?? 0);

  const { data: produto, error } = await supabase
    .from("produtos")
    .insert({
      owner_id: user.id,
      categoria_id: categoriaId,
      nome,
      marca: String(formData.get("marca") ?? "").trim() || null,
      descricao: String(formData.get("descricao") ?? "").trim() || null,
      custo,
      preco_varejo: precoVarejo,
      preco_atacado: precoAtacadoRaw ? Number(precoAtacadoRaw) : null,
      estoque_atual: 0,
      unidade_medida: String(formData.get("unidade_medida") ?? "un"),
      fornecedor_nome: String(formData.get("fornecedor_nome") ?? "").trim() || null,
    })
    .select("id")
    .single();

  if (error) throw error;

  if (estoqueInicial > 0) {
    const { error: rpcError } = await supabase.rpc("registrar_entrada_estoque", {
      p_produto_id: produto.id,
      p_variacao_id: null,
      p_quantidade: estoqueInicial,
      p_valor_unitario: custo,
      p_data: new Date().toISOString().slice(0, 10),
      p_fornecedor_nome: String(formData.get("fornecedor_nome") ?? "").trim() || null,
      p_observacoes: "Estoque inicial do cadastro",
    });
    if (rpcError) throw rpcError;
  }

  revalidatePath("/produtos");
  revalidatePath("/");
}

export async function registrarEntradaEstoque(formData: FormData) {
  const supabase = await createClient();
  const produtoId = String(formData.get("produto_id"));
  const quantidade = Number(formData.get("quantidade"));
  const valorUnitario = Number(formData.get("valor_unitario"));
  const fornecedorNome = String(formData.get("fornecedor_nome") ?? "").trim() || null;

  const { error } = await supabase.rpc("registrar_entrada_estoque", {
    p_produto_id: produtoId,
    p_variacao_id: null,
    p_quantidade: quantidade,
    p_valor_unitario: valorUnitario,
    p_data: new Date().toISOString().slice(0, 10),
    p_fornecedor_nome: fornecedorNome,
    p_observacoes: null,
  });
  if (error) throw error;

  revalidatePath("/produtos");
  revalidatePath("/fluxo-de-caixa");
  revalidatePath("/");
}

export async function excluirProduto(produtoId: string, apagarHistorico: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("excluir_produto", {
    p_produto_id: produtoId,
    p_apagar_historico: apagarHistorico,
  });
  if (error) throw error;

  revalidatePath("/produtos");
  revalidatePath("/fluxo-de-caixa");
  revalidatePath("/");
}
