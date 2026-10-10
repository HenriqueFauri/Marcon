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
      na_vitrine: formData.get("na_vitrine") === "on",
      destaque: formData.get("destaque") === "on",
    },
  } as const;
}

interface LinhaVariacao {
  nome: string;
  sku: string | null;
  custo: number | null;
  preco: number | null;
  estoque: number;
}

// Lê as variações do cadastro (campos repetidos var_nome, var_estoque...). Linha sem nome é ignorada.
function lerVariacoes(formData: FormData): (LinhaVariacao | { erro: string })[] {
  const nomes = formData.getAll("var_nome").map((v) => String(v).trim());
  const skus = formData.getAll("var_sku").map((v) => String(v).trim());
  const custos = formData.getAll("var_custo").map((v) => String(v).trim().replace(",", "."));
  const precos = formData.getAll("var_preco").map((v) => String(v).trim().replace(",", "."));
  const estoques = formData.getAll("var_estoque").map((v) => String(v).trim().replace(",", "."));

  const vistos = new Set<string>();
  const linhas: (LinhaVariacao | { erro: string })[] = [];
  nomes.forEach((nome, i) => {
    if (!nome) return;
    const chave = nome.toLowerCase();
    if (vistos.has(chave)) {
      linhas.push({ erro: `A variação "${nome}" aparece duas vezes.` });
      return;
    }
    vistos.add(chave);
    const custo = custos[i] ? Number(custos[i]) : null;
    const preco = precos[i] ? Number(precos[i]) : null;
    const estoque = estoques[i] ? Number(estoques[i]) : 0;
    if ([custo, preco].some((v) => v !== null && (!Number.isFinite(v) || v < 0))) {
      linhas.push({ erro: `Confira o custo e o preço da variação "${nome}".` });
      return;
    }
    if (!Number.isInteger(estoque) || estoque < 0) {
      linhas.push({ erro: `O estoque da variação "${nome}" precisa ser um número inteiro, sem negativo.` });
      return;
    }
    linhas.push({ nome, sku: skus[i] || null, custo, preco, estoque });
  });
  return linhas;
}

// "Esse estoque já era meu": entra no estoque sem sair do caixa. O argumento só é mandado quando
// marcado, então quem ainda não rodou a migration 0021 segue funcionando como antes.
function argsEstoqueJaPago(formData: FormData) {
  return formData.get("estoque_ja_pago") === "true" ? { p_afeta_caixa: false } : {};
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

    // variações preenchidas no cadastro: uma linha por variação (campos var_*)
    const variacoes = temVariacoes ? lerVariacoes(formData) : [];
    for (const v of variacoes) {
      if ("erro" in v) return { ok: false, error: v.erro };
    }

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
        ...argsEstoqueJaPago(formData),
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

    const linhasVariacao = variacoes.filter((v): v is LinhaVariacao => !("erro" in v));
    if (linhasVariacao.length > 0) {
      const { data: criadas, error: erroVariacoes } = await supabase
        .from("produto_variacoes")
        .insert(
          linhasVariacao.map((v) => ({
            owner_id: user.id,
            produto_id: produto.id,
            nome_combinacao: v.nome,
            sku: v.sku,
            custo: v.custo,
            preco_venda: v.preco,
          })),
        )
        .select("id, nome_combinacao");
      if (erroVariacoes) {
        revalidarProduto(produto.id);
        return {
          ok: false,
          error: `Produto criado, mas as variações não foram salvas: ${erroVariacoes.message}. Adicione-as na página do produto.`,
        };
      }

      // estoque inicial de cada variação entra como compra, pelo custo dela (ou o do produto)
      const idPorNome = new Map((criadas ?? []).map((c) => [c.nome_combinacao as string, c.id as string]));
      for (const v of linhasVariacao) {
        const variacaoId = idPorNome.get(v.nome);
        if (!variacaoId || v.estoque <= 0) continue;
        const { error: rpcError } = await supabase.rpc("registrar_entrada_estoque", {
          p_produto_id: produto.id,
          p_variacao_id: variacaoId,
          p_quantidade: v.estoque,
          p_valor_unitario: v.custo ?? lido.campos.custo,
          p_data: hojeISO(),
          p_fornecedor_nome: fornecedorNome,
          p_observacoes: "Estoque inicial do cadastro",
          p_fornecedor_id: fornecedorId,
          ...argsEstoqueJaPago(formData),
        });
        if (rpcError) {
          revalidarProduto(produto.id);
          revalidatePath("/fluxo-de-caixa");
          return {
            ok: false,
            error: `Produto criado, mas o estoque inicial de "${v.nome}" não foi registrado: ${rpcError.message}`,
          };
        }
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

// Corrige a quantidade em estoque para o valor real, sem tocar no caixa nem no custo.
export async function ajustarEstoque(formData: FormData): Promise<ActionResult> {
  try {
    const produtoId = texto(formData, "produto_id");
    const variacaoId = texto(formData, "variacao_id") || null;
    const novoEstoque = numero(formData, "novo_estoque");

    if (novoEstoque === null || !Number.isInteger(novoEstoque) || novoEstoque < 0)
      return { ok: false, error: "Informe quantas unidades você tem agora (zero ou mais)." };

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("ajustar_estoque", {
      p_produto_id: produtoId,
      p_variacao_id: variacaoId,
      p_novo_estoque: novoEstoque,
      p_observacoes: textoOuNull(formData, "observacoes"),
    });
    if (error) return falha(error);

    revalidarProduto(produtoId);
    revalidatePath("/");
    const diferenca = Number(data ?? 0);
    return ok(
      `Estoque ajustado para ${novoEstoque}${diferenca ? ` (${diferenca > 0 ? "+" : "−"}${Math.abs(diferenca)})` : ""}.`,
    );
  } catch (e) {
    return falha(e);
  }
}

// Lê os campos de uma variação (nome, sku, custo, preço). Custo e preço em branco valem os do produto.
function lerCamposVariacao(formData: FormData) {
  const nomeCombinacao = texto(formData, "nome_combinacao");
  if (!nomeCombinacao) return { erro: "Dê um nome para a variação (ex: Azul / M)." } as const;
  const custo = numero(formData, "custo");
  const precoVenda = numero(formData, "preco_venda");
  if ([custo, precoVenda].some((v) => v !== null && (Number.isNaN(v) || v < 0)))
    return { erro: "Confira o custo e o preço da variação." } as const;
  return { nomeCombinacao, custo, precoVenda, sku: textoOuNull(formData, "sku") } as const;
}

export async function criarVariacao(formData: FormData): Promise<ActionResult> {
  try {
    const produtoId = texto(formData, "produto_id");
    const lido = lerCamposVariacao(formData);
    if ("erro" in lido) return { ok: false, error: lido.erro! };
    const estoque = Math.trunc(numero(formData, "estoque") ?? 0);
    if (Number.isNaN(estoque) || estoque < 0) return { ok: false, error: "O estoque inicial não pode ser negativo." };

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Sua sessão expirou. Entre novamente." };

    const { data: produto } = await supabase.from("produtos").select("custo, fornecedor_id, fornecedor_nome").eq("id", produtoId).maybeSingle();
    if (!produto) return { ok: false, error: "Produto não encontrado." };

    const { data: criada, error } = await supabase
      .from("produto_variacoes")
      .insert({
        owner_id: user.id,
        produto_id: produtoId,
        nome_combinacao: lido.nomeCombinacao,
        custo: lido.custo,
        preco_venda: lido.precoVenda,
        sku: lido.sku,
      })
      .select("id")
      .single();
    if (error) return falha(error);

    // estoque inicial entra como compra (sai do caixa), pelo custo da variação ou o do produto
    if (estoque > 0) {
      const { error: rpcError } = await supabase.rpc("registrar_entrada_estoque", {
        p_produto_id: produtoId,
        p_variacao_id: criada.id,
        p_quantidade: estoque,
        p_valor_unitario: lido.custo ?? Number(produto.custo),
        p_data: hojeISO(),
        p_fornecedor_nome: produto.fornecedor_nome,
        p_observacoes: "Estoque inicial da variação",
        p_fornecedor_id: produto.fornecedor_id,
        ...argsEstoqueJaPago(formData),
      });
      if (rpcError) {
        revalidarProduto(produtoId);
        return { ok: false, error: `Variação criada, mas o estoque inicial não foi registrado: ${rpcError.message}` };
      }
      revalidatePath("/fluxo-de-caixa");
    }

    revalidarProduto(produtoId);
    return ok("Variação adicionada.");
  } catch (e) {
    return falha(e);
  }
}

export async function atualizarVariacao(formData: FormData): Promise<ActionResult> {
  try {
    const id = texto(formData, "id");
    const produtoId = texto(formData, "produto_id");
    const lido = lerCamposVariacao(formData);
    if ("erro" in lido) return { ok: false, error: lido.erro! };

    const supabase = await createClient();
    const { error } = await supabase
      .from("produto_variacoes")
      .update({
        nome_combinacao: lido.nomeCombinacao,
        custo: lido.custo,
        preco_venda: lido.precoVenda,
        sku: lido.sku,
      })
      .eq("id", id)
      .eq("produto_id", produtoId);
    if (error) return falha(error);

    revalidarProduto(produtoId);
    return ok("Variação atualizada.");
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
    revalidatePath(`/anuncios/${produtoId}`);
    revalidatePath("/anuncios");
    return ok("Foto removida.");
  } catch (e) {
    return falha(e);
  }
}

export async function registrarFoto(
  produtoId: string,
  path: string,
  ordem: number,
  variacaoId: string | null = null,
): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Sua sessão expirou. Entre novamente." };

    // o arquivo sobe direto do navegador; aqui só aceita o que está na pasta do próprio usuário e deste produto
    if (!path.startsWith(`${user.id}/${produtoId}/`) || path.includes("..")) return { ok: false, error: "Imagem inválida." };
    const { data: produto } = await supabase.from("produtos").select("id").eq("id", produtoId).maybeSingle();
    if (!produto) return { ok: false, error: "Produto não encontrado." };

    const { error } = await supabase.from("produto_fotos").insert({
      owner_id: user.id,
      produto_id: produtoId,
      variacao_id: variacaoId,
      path,
      ordem,
    });
    if (error) return falha(error);

    revalidatePath(`/anuncios/${produtoId}`);
    revalidatePath("/anuncios");
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

// nova ordem das fotos de um bloco (gerais ou de uma variação), arrastadas no anúncio; a primeira é a capa
// Foto fora da vitrine continua no anúncio (copiar, baixar); só a loja deixa de mostrar.
export async function definirFotoNaVitrine(id: string, produtoId: string, valor: boolean): Promise<ActionResult> {
  try {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuid.test(id) || !uuid.test(produtoId)) return { ok: false, error: "Foto inválida." };
    const supabase = await createClient();
    const { error } = await supabase
      .from("produto_fotos")
      .update({ na_vitrine: valor === true })
      .eq("id", id)
      .eq("produto_id", produtoId);
    if (error) return falha(error);

    revalidatePath(`/anuncios/${produtoId}`);
    revalidatePath("/vitrine", "layout");
    return ok();
  } catch (e) {
    return falha(e);
  }
}

export async function reordenarFotos(produtoId: string, ids: string[]): Promise<ActionResult> {
  try {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuid.test(produtoId) || !Array.isArray(ids) || ids.length === 0 || ids.length > 20 || !ids.every((id) => uuid.test(id)))
      return { ok: false, error: "Fotos inválidas." };

    const supabase = await createClient();
    const resultados = await Promise.all(
      ids.map((id, ordem) => supabase.from("produto_fotos").update({ ordem }).eq("id", id).eq("produto_id", produtoId)),
    );
    const erro = resultados.find((r) => r.error)?.error;
    if (erro) return falha(erro);

    revalidatePath(`/anuncios/${produtoId}`);
    revalidatePath("/anuncios");
    return ok();
  } catch (e) {
    return falha(e);
  }
}
