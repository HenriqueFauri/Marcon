"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { falha, numero, ok, texto, textoOuNull, type ActionResult } from "@/lib/action";
import { hojeISO } from "@/lib/format";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const UNIDADES = ["un", "kg", "g", "l", "ml", "m", "cx", "par", "pct"];

function revalidarProduto(produtoId?: string) {
  revalidatePath("/produtos");
  if (produtoId) revalidatePath(`/produtos/${produtoId}`);
  revalidatePath("/vendas/novo");
  revalidatePath("/");
}

async function resolverCategoria(supabase: Supabase, ownerId: string, nome: string) {
  if (!nome) return null;
  const { data, error } = await supabase
    .from("categorias")
    .upsert({ owner_id: ownerId, nome }, { onConflict: "owner_id,nome" })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

async function resolverFornecedor(supabase: Supabase, formData: FormData) {
  const fornecedorId = texto(formData, "fornecedor_id") || null;
  const nomeManual = texto(formData, "fornecedor_nome") || null;
  if (!fornecedorId) return { fornecedorId: null, fornecedorNome: nomeManual };
  const { data } = await supabase.from("fornecedores").select("nome").eq("id", fornecedorId).single();
  return { fornecedorId, fornecedorNome: data?.nome ?? nomeManual };
}

// Lê e valida os campos comuns de cadastro/edição de produto.
function camposProduto(formData: FormData) {
  const nome = texto(formData, "nome");
  const custo = numero(formData, "custo") ?? 0;
  const precoVarejo = numero(formData, "preco_varejo") ?? 0;
  const precoAtacado = numero(formData, "preco_atacado");
  const alerta = numero(formData, "alerta_estoque_baixo");
  const unidade = texto(formData, "unidade_medida");

  if (!nome) return { erro: "O nome do produto é obrigatório." } as const;
  if ([custo, precoVarejo].some((v) => Number.isNaN(v) || v < 0))
    return { erro: "Confira o custo e o preço de venda." } as const;
  if (precoAtacado !== null && (Number.isNaN(precoAtacado) || precoAtacado < 0))
    return { erro: "Confira o preço de atacado." } as const;
  if (alerta !== null && (Number.isNaN(alerta) || alerta < 0 || !Number.isInteger(alerta)))
    return { erro: "O alerta de estoque baixo precisa ser um número inteiro." } as const;

  return {
    campos: {
      nome,
      marca: textoOuNull(formData, "marca"),
      descricao: textoOuNull(formData, "descricao"),
      sku: textoOuNull(formData, "sku"),
      custo,
      preco_varejo: precoVarejo,
      preco_atacado: precoAtacado,
      alerta_estoque_baixo: alerta,
      unidade_medida: UNIDADES.includes(unidade) ? unidade : "un",
    },
  } as const;
}

export async function criarProduto(formData: FormData): Promise<ActionResult> {
  try {
    const lido = camposProduto(formData);
    if ("erro" in lido) return { ok: false, error: lido.erro! };

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Sua sessão expirou. Entre novamente." };

    const temVariacoes = formData.get("tem_variacoes") === "true";
    const estoqueInicial = temVariacoes ? 0 : Math.trunc(numero(formData, "estoque_inicial") ?? 0);
    if (Number.isNaN(estoqueInicial) || estoqueInicial < 0)
      return { ok: false, error: "O estoque inicial não pode ser negativo." };

    const categoriaId = await resolverCategoria(supabase, user.id, texto(formData, "categoria"));
    const { fornecedorId, fornecedorNome } = await resolverFornecedor(supabase, formData);

    const { data: produto, error } = await supabase
      .from("produtos")
      .insert({
        owner_id: user.id,
        categoria_id: categoriaId,
        ...lido.campos,
        estoque_atual: 0,
        tem_variacoes: temVariacoes,
        fornecedor_nome: fornecedorNome,
        fornecedor_id: fornecedorId,
      })
      .select("id")
      .single();
    if (error) return falha(error);

    if (estoqueInicial > 0) {
      const { error: rpcError } = await supabase.rpc("registrar_entrada_estoque", {
        p_produto_id: produto.id,
        p_variacao_id: null,
        p_quantidade: estoqueInicial,
        p_valor_unitario: lido.campos.custo,
        p_data: hojeISO(),
        p_fornecedor_nome: fornecedorNome,
        p_observacoes: "Estoque inicial do cadastro",
        p_fornecedor_id: fornecedorId,
      });
      if (rpcError) {
        revalidarProduto(produto.id);
        return {
          ok: false,
          error: `Produto criado, mas o estoque inicial não foi registrado: ${rpcError.message}`,
        };
      }
      revalidatePath("/fluxo-de-caixa");
    }

    revalidarProduto(produto.id);
    return { ok: true, message: "Produto cadastrado.", id: produto.id };
  } catch (e) {
    return falha(e);
  }
}

export async function atualizarProduto(produtoId: string, formData: FormData): Promise<ActionResult> {
  try {
    const lido = camposProduto(formData);
    if ("erro" in lido) return { ok: false, error: lido.erro! };

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Sua sessão expirou. Entre novamente." };

    const categoriaId = await resolverCategoria(supabase, user.id, texto(formData, "categoria"));
    const { fornecedorId, fornecedorNome } = await resolverFornecedor(supabase, formData);
    const status = texto(formData, "status") === "inativo" ? "inativo" : "ativo";

    const { error } = await supabase
      .from("produtos")
      .update({
        ...lido.campos,
        categoria_id: categoriaId,
        fornecedor_id: fornecedorId,
        fornecedor_nome: fornecedorNome,
        status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", produtoId);
    if (error) return falha(error);

    revalidarProduto(produtoId);
    return { ok: true, message: "Produto atualizado.", id: produtoId };
  } catch (e) {
    return falha(e);
  }
}

export async function registrarEntradaEstoque(formData: FormData): Promise<ActionResult> {
  try {
    const produtoId = texto(formData, "produto_id");
    const variacaoId = texto(formData, "variacao_id") || null;
    const quantidade = numero(formData, "quantidade");
    const valorUnitario = numero(formData, "valor_unitario");
    const dataBruta = texto(formData, "data");

    if (quantidade === null || !Number.isInteger(quantidade) || quantidade <= 0)
      return { ok: false, error: "Informe uma quantidade inteira maior que zero." };
    if (valorUnitario === null || Number.isNaN(valorUnitario) || valorUnitario < 0)
      return { ok: false, error: "Informe o preço unitário pago." };

    const supabase = await createClient();
    const { fornecedorId, fornecedorNome } = await resolverFornecedor(supabase, formData);

    const { error } = await supabase.rpc("registrar_entrada_estoque", {
      p_produto_id: produtoId,
      p_variacao_id: variacaoId,
      p_quantidade: quantidade,
      p_valor_unitario: valorUnitario,
      p_data: /^\d{4}-\d{2}-\d{2}$/.test(dataBruta) ? dataBruta : hojeISO(),
      p_fornecedor_nome: fornecedorNome,
      p_observacoes: textoOuNull(formData, "observacoes"),
      p_fornecedor_id: fornecedorId,
    });
    if (error) return falha(error);

    revalidarProduto(produtoId);
    revalidatePath("/fluxo-de-caixa");
    return ok(`Entrada de ${quantidade} unidade(s) registrada.`);
  } catch (e) {
    return falha(e);
  }
}

export async function registrarSaidaEstoque(formData: FormData): Promise<ActionResult> {
  try {
    const produtoId = texto(formData, "produto_id");
    const variacaoId = texto(formData, "variacao_id") || null;
    const quantidade = numero(formData, "quantidade");
    const motivo = texto(formData, "motivo");
    const dataBruta = texto(formData, "data");

    if (quantidade === null || !Number.isInteger(quantidade) || quantidade <= 0)
      return { ok: false, error: "Informe uma quantidade inteira maior que zero." };
    if (!["perda", "uso", "ajuste"].includes(motivo)) return { ok: false, error: "Escolha o motivo da saída." };

    const supabase = await createClient();
    const { error } = await supabase.rpc("registrar_saida_estoque", {
      p_produto_id: produtoId,
      p_variacao_id: variacaoId,
      p_quantidade: quantidade,
      p_motivo: motivo,
      p_data: /^\d{4}-\d{2}-\d{2}$/.test(dataBruta) ? dataBruta : hojeISO(),
      p_observacoes: textoOuNull(formData, "observacoes"),
    });
    if (error) return falha(error);

    revalidarProduto(produtoId);
    return ok(`Saída de ${quantidade} unidade(s) registrada.`);
  } catch (e) {
    return falha(e);
  }
}

export async function criarVariacao(formData: FormData): Promise<ActionResult> {
  try {
    const produtoId = texto(formData, "produto_id");
    const nomeCombinacao = texto(formData, "nome_combinacao");
    if (!nomeCombinacao) return { ok: false, error: "Dê um nome para a variação (ex: Azul / M)." };
    const custo = numero(formData, "custo");
    const precoVenda = numero(formData, "preco_venda");
    if ([custo, precoVenda].some((v) => v !== null && (Number.isNaN(v) || v < 0)))
      return { ok: false, error: "Confira o custo e o preço da variação." };

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Sua sessão expirou. Entre novamente." };

    const { error } = await supabase.from("produto_variacoes").insert({
      owner_id: user.id,
      produto_id: produtoId,
      nome_combinacao: nomeCombinacao,
      custo,
      preco_venda: precoVenda,
      sku: textoOuNull(formData, "sku"),
    });
    if (error) return falha(error);

    revalidarProduto(produtoId);
    return ok("Variação adicionada.");
  } catch (e) {
    return falha(e);
  }
}

export async function excluirVariacao(id: string, produtoId: string): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("produto_variacoes").delete().eq("id", id);
    if (error) return falha(error);

    revalidarProduto(produtoId);
    return ok("Variação excluída.");
  } catch (e) {
    return falha(e);
  }
}

export async function excluirFoto(id: string, path: string, produtoId: string): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("produto_fotos").delete().eq("id", id);
    if (error) return falha(error);
    await supabase.storage.from("produto-fotos").remove([path]);

    revalidatePath(`/produtos/${produtoId}`);
    return ok("Foto removida.");
  } catch (e) {
    return falha(e);
  }
}

export async function registrarFoto(produtoId: string, path: string, ordem: number): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Sua sessão expirou. Entre novamente." };

    const { error } = await supabase.from("produto_fotos").insert({
      owner_id: user.id,
      produto_id: produtoId,
      path,
      ordem,
    });
    if (error) return falha(error);

    revalidatePath(`/produtos/${produtoId}`);
    revalidatePath("/produtos");
    return ok();
  } catch (e) {
    return falha(e);
  }
}

export async function excluirProduto(produtoId: string, apagarHistorico: boolean): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("excluir_produto", {
      p_produto_id: produtoId,
      p_apagar_historico: apagarHistorico,
    });
    if (error) return falha(error);

    revalidarProduto();
    revalidatePath("/fluxo-de-caixa");
    return ok("Produto excluído.");
  } catch (e) {
    return falha(e);
  }
}
