"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import Anthropic from "@anthropic-ai/sdk";
import { falha, mensagemDeErro, ok, type ActionResult } from "@/lib/action";
import { cortar, limitesDoCanal } from "@/lib/anuncio";
import { MODELO_IA, escreverAnuncioComIA, iaDisponivel } from "@/lib/ia-anuncio";
import { limparPerguntas, type PerguntasIA } from "@/lib/ia-perguntas";
import { lerUso, restante } from "@/lib/uso";
import type { ProdutoVariacao } from "@/types/domain";

// cria (id nulo) ou atualiza uma versão de anúncio de um produto num canal
export async function salvarVersaoAnuncio(dados: {
  id: string | null;
  produtoId: string;
  canalId: string;
  variacaoId: string | null;
  titulo: string;
  descricao: string;
}): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("salvar_anuncio_versao", {
      p_id: dados.id,
      p_produto_id: dados.produtoId,
      p_canal_id: dados.canalId,
      p_variacao_id: dados.variacaoId,
      p_titulo: dados.titulo.trim() || null,
      p_descricao: dados.descricao.trim() || null,
    });
    if (error) return falha(error);

    revalidatePath(`/anuncios/${dados.produtoId}`);
    revalidatePath("/anuncios");
    return { ok: true, message: dados.id ? "Anúncio salvo." : "Versão criada.", id: data as string };
  } catch (e) {
    return falha(e);
  }
}

// Diz por que a chamada à IA falhou, em português. Enquanto a IA está em teste, o motivo
// real aparece na tela (e vai inteiro para o log do servidor) para achar o problema rápido.
function motivoDaFalhaDaIA(e: InstanceType<typeof Anthropic.APIError>) {
  const detalhe = (e.message ?? "").replace(/s+/g, " ").slice(0, 200);
  const sobra = "Sua cota não foi usada.";
  if (e.status === 401) return `A chave da IA (ANTHROPIC_API_KEY) foi recusada. Confira a chave na Vercel e refaça o deploy. ${sobra}`;
  if (e.status === 403) return `A chave da IA não tem permissão para isso (use uma chave de workspace, não de organização). ${sobra}`;
  if (e.status === 404) return `O modelo da IA não foi encontrado. ${sobra}`;
  if (e.status === 429) return `Muitos pedidos à IA ao mesmo tempo. Espere um pouco e tente de novo. ${sobra}`;
  if (/credit balance|billing|saldo/i.test(detalhe)) {
    return `A conta da Anthropic está sem saldo. Adicione créditos em console.anthropic.com > Billing. ${sobra}`;
  }
  if (e.status && e.status >= 500) return `A IA está fora do ar agora. Tente de novo em instantes. ${sobra}`;
  return `A IA recusou o pedido (erro ${e.status ?? "de conexão"}): ${detalhe} ${sobra}`;
}

export type ResultadoIA =
  | { ok: true; titulo: string; descricao: string; restantes: number | null }
  | { ok: false; error: string };

// Escreve título e descrição com IA. Não salva nada no anúncio: o texto volta para a
// tela, o usuário revisa e salva. A geração é registrada antes de chamar a IA para o
// banco barrar quem passou do limite do mês; se a IA falhar, o registro é apagado e a
// cota volta.
export async function escreverAnuncioIA(dados: {
  produtoId: string;
  canalId: string;
  variacaoId: string | null;
  perguntas: PerguntasIA;
}): Promise<ResultadoIA> {
  if (!iaDisponivel()) return { ok: false, error: "A escrita com IA ainda não está ligada neste servidor." };
  try {
    const supabase = await createClient();
    const [{ data: produto }, { data: variacoesData }, { data: fotosData }, { data: canal }] = await Promise.all([
      supabase.from("produtos").select("nome, marca, descricao, preco_varejo, categorias(nome)").eq("id", dados.produtoId).maybeSingle(),
      supabase.from("produto_variacoes").select("*").eq("produto_id", dados.produtoId).order("nome_combinacao"),
      supabase.from("produto_fotos").select("path, variacao_id").eq("produto_id", dados.produtoId).order("ordem").order("created_at"),
      supabase.from("canais_venda").select("nome").eq("id", dados.canalId).maybeSingle(),
    ]);
    if (!produto || !canal) return { ok: false, error: "Produto ou canal não encontrado." };

    const variacoes = (variacoesData ?? []) as ProdutoVariacao[];
    const variacao = variacoes.find((v) => v.id === dados.variacaoId) ?? null;
    // fotos da variação escolhida primeiro, depois as do produto; no máximo 3
    const fotos = (fotosData ?? [])
      .filter((f) => !variacao || f.variacao_id === variacao.id || f.variacao_id === null)
      .sort((a, b) => Number(b.variacao_id === variacao?.id) - Number(a.variacao_id === variacao?.id))
      .slice(0, 3);
    const { data: assinadas } = fotos.length
      ? await supabase.storage.from("produto-fotos").createSignedUrls(fotos.map((f) => f.path), 600)
      : { data: [] };

    const { data: registro, error: erroRegistro } = await supabase
      .from("ia_geracoes")
      .insert({ produto_id: dados.produtoId, canal: canal.nome, modelo: MODELO_IA })
      .select("id")
      .single();
    if (erroRegistro) {
      if (erroRegistro.code === "42P01") return { ok: false, error: "O banco de dados está desatualizado. Rode as migrations mais recentes." };
      return { ok: false, error: mensagemDeErro(erroRegistro) };
    }

    let saida;
    try {
      const categoria = produto.categorias as unknown as { nome: string } | null;
      saida = await escreverAnuncioComIA({
        canal: canal.nome,
        nome: produto.nome,
        marca: produto.marca,
        categoria: categoria?.nome ?? null,
        descricao: produto.descricao,
        precoVarejo: Number(produto.preco_varejo),
        variacoes,
        variacao,
        fotos: (assinadas ?? []).map((a) => a.signedUrl).filter((u): u is string => !!u),
        perguntas: limparPerguntas(dados.perguntas),
      });
    } catch (e) {
      await supabase.from("ia_geracoes").delete().eq("id", registro.id);
      console.error("[ia-anuncio]", e);
      if (e instanceof Anthropic.APIError) return { ok: false, error: motivoDaFalhaDaIA(e) };
      return { ok: false, error: mensagemDeErro(e, "A IA não conseguiu escrever agora. Tente de novo; sua cota não foi usada.") };
    }

    await supabase
      .from("ia_geracoes")
      .update({ tokens_entrada: saida.tokensEntrada, tokens_saida: saida.tokensSaida })
      .eq("id", registro.id);

    const limites = limitesDoCanal(canal.nome);
    const uso = await lerUso(supabase);
    return {
      ok: true,
      titulo: cortar(saida.titulo, limites.titulo),
      descricao: cortar(saida.descricao, limites.descricao),
      restantes: uso ? restante(uso.iaMes, uso.limites.iaMes) : null,
    };
  } catch (e) {
    return { ok: false, error: mensagemDeErro(e) };
  }
}

export async function excluirVersaoAnuncio(id: string, produtoId: string): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("produto_anuncios").delete().eq("id", id);
    if (error) return falha(error);

    revalidatePath(`/anuncios/${produtoId}`);
    revalidatePath("/anuncios");
    return ok("Versão excluída.");
  } catch (e) {
    return falha(e);
  }
}
