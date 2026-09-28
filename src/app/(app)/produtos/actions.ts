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
  const temVariacoes = formData.get("tem_variacoes") === "true";
  const estoqueInicial = temVariacoes ? 0 : Number(formData.get("estoque_inicial") ?? 0);

  const fornecedorId = String(formData.get("fornecedor_id") ?? "") || null;
  const fornecedorNomeManual = String(formData.get("fornecedor_nome") ?? "").trim();
  let fornecedorNome: string | null = fornecedorNomeManual || null;
  if (fornecedorId) {
    const { data: fornecedor } = await supabase
      .from("fornecedores")
      .select("nome")
      .eq("id", fornecedorId)
      .single();
    fornecedorNome = fornecedor?.nome ?? (fornecedorNomeManual || null);
  }

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
      tem_variacoes: temVariacoes,
      unidade_medida: String(formData.get("unidade_medida") ?? "un"),
      fornecedor_nome: fornecedorNome,
      fornecedor_id: fornecedorId,
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
      p_fornecedor_nome: fornecedorNome,
      p_observacoes: "Estoque inicial do cadastro",
      p_fornecedor_id: fornecedorId,
    });
    if (rpcError) throw rpcError;
  }

  revalidatePath("/produtos");
  revalidatePath("/");
}

export async function registrarEntradaEstoque(formData: FormData) {
  const supabase = await createClient();
  const produtoId = String(formData.get("produto_id"));
  const variacaoId = String(formData.get("variacao_id") ?? "") || null;
  const quantidade = Number(formData.get("quantidade"));
  const valorUnitario = Number(formData.get("valor_unitario"));
  const fornecedorId = String(formData.get("fornecedor_id") ?? "") || null;
  const fornecedorNomeManual = String(formData.get("fornecedor_nome") ?? "").trim();

  let fornecedorNome: string | null = fornecedorNomeManual || null;
  if (fornecedorId) {
    const { data: fornecedor } = await supabase
      .from("fornecedores")
      .select("nome")
      .eq("id", fornecedorId)
      .single();
    fornecedorNome = fornecedor?.nome ?? (fornecedorNomeManual || null);
  }

  const { error } = await supabase.rpc("registrar_entrada_estoque", {
    p_produto_id: produtoId,
    p_variacao_id: variacaoId,
    p_quantidade: quantidade,
    p_valor_unitario: valorUnitario,
    p_data: new Date().toISOString().slice(0, 10),
    p_fornecedor_nome: fornecedorNome,
    p_observacoes: null,
    p_fornecedor_id: fornecedorId,
  });
  if (error) throw error;

  revalidatePath("/produtos");
  revalidatePath("/fluxo-de-caixa");
  revalidatePath("/");
}

export async function criarVariacao(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("não autenticado");

  const produtoId = String(formData.get("produto_id"));
  const nomeCombinacao = String(formData.get("nome_combinacao") ?? "").trim();
  if (!nomeCombinacao) throw new Error("nome da variação é obrigatório");

  const custoRaw = formData.get("custo");
  const precoVendaRaw = formData.get("preco_venda");

  const { error } = await supabase.from("produto_variacoes").insert({
    owner_id: user.id,
    produto_id: produtoId,
    nome_combinacao: nomeCombinacao,
    custo: custoRaw ? Number(custoRaw) : null,
    preco_venda: precoVendaRaw ? Number(precoVendaRaw) : null,
    sku: String(formData.get("sku") ?? "").trim() || null,
  });
  if (error) throw error;

  revalidatePath(`/produtos/${produtoId}`);
}

export async function excluirVariacao(id: string, produtoId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("produto_variacoes").delete().eq("id", id);
  if (error) throw error;

  revalidatePath(`/produtos/${produtoId}`);
}

export async function excluirFoto(id: string, path: string, produtoId: string) {
  const supabase = await createClient();
  await supabase.storage.from("produto-fotos").remove([path]);
  const { error } = await supabase.from("produto_fotos").delete().eq("id", id);
  if (error) throw error;

  revalidatePath(`/produtos/${produtoId}`);
}

export async function registrarFoto(produtoId: string, path: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("não autenticado");

  const { error } = await supabase.from("produto_fotos").insert({
    owner_id: user.id,
    produto_id: produtoId,
    path,
  });
  if (error) throw error;

  revalidatePath(`/produtos/${produtoId}`);
}

export async function salvarAnuncio(formData: FormData) {
  const supabase = await createClient();
  const produtoId = String(formData.get("produto_id"));
  const canalId = String(formData.get("canal_id"));

  const { error } = await supabase.rpc("salvar_anuncio_produto", {
    p_produto_id: produtoId,
    p_canal_id: canalId,
    p_titulo: String(formData.get("titulo") ?? "").trim() || null,
    p_descricao: String(formData.get("descricao") ?? "").trim() || null,
  });
  if (error) throw error;

  revalidatePath(`/produtos/${produtoId}`);
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
