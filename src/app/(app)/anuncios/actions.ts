"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import Anthropic from "@anthropic-ai/sdk";
import { falha, mensagemDeErro, ok, type ActionResult } from "@/lib/action";
import { LIMITE_DESCRICAO, LIMITE_TITULO, cortar } from "@/lib/anuncio";
import { MODELO_IA, escreverAnuncioComIA, iaDisponivel } from "@/lib/ia-anuncio";
import { limparPerguntas, type PerguntasIA } from "@/lib/ia-perguntas";
import { lerUso, restante } from "@/lib/uso";
import type { ProdutoVariacao } from "@/types/domain";

// cria (id nulo) ou atualiza o anúncio do produto (um só, sem canal)
export async function salvarAnuncio(dados: {
  id: string | null;
  produtoId: string;
  variacaoId: string | null;
  titulo: string;
  descricao: string;
}): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("salvar_anuncio_versao", {
      p_id: dados.id,
      p_produto_id: dados.produtoId,
      p_canal_id: null,
      p_variacao_id: dados.variacaoId,
      p_titulo: dados.titulo.trim() || null,
      p_descricao: dados.descricao.trim() || null,
    });
    if (error) return falha(error);

    revalidatePath(`/anuncios/${dados.produtoId}`);
    revalidatePath("/anuncios");
    return { ok: true, message: "Anúncio salvo.", id: data as string };
  } catch (e) {
    return falha(e);
  }
}

// Diz por que a chamada à IA falhou, em português. Enquanto a IA está em teste, o motivo
// real aparece na tela (e vai inteiro para o log do servidor) para achar o problema rápido.
function motivoDaFalhaDaIA(e: InstanceType<typeof Anthropic.APIError>) {
  const detalhe = (e.message ?? "").replace(/\s+/g, " ").slice(0, 200);
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

// valor gravado em ia_geracoes.canal: o anúncio não tem mais canal, a coluna só precisa de um texto
const CANAL_UNICO = "Geral";

export type ResultadoIA =
  | { ok: true; titulo: string; descricao: string; restantes: number | null }
  | { ok: false; error: string };

// Escreve título e descrição com IA. Não salva nada no anúncio: o texto volta para a
// tela, o usuário revisa e salva. A geração é registrada antes de chamar a IA para o
// banco barrar quem passou do limite do mês; se a IA falhar, o registro é apagado e a
// cota volta.
export async function escreverAnuncioIA(dados: {
  produtoId: string;
  perguntas: PerguntasIA;
}): Promise<ResultadoIA> {
  if (!iaDisponivel()) return { ok: false, error: "A escrita com IA ainda não está ligada neste servidor." };
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Sua sessão expirou. Entre novamente." };
    // o usuário não pode apagar nem editar ia_geracoes (a cota é a contagem dessas linhas): quem devolve a cota
    // e grava os tokens é o servidor, com a chave de serviço, sempre filtrando pelo dono
    const admin = createAdminClient();
    if (!admin) return { ok: false, error: "A escrita com IA ainda não está ligada neste servidor." };
    const [{ data: produto }, { data: variacoesData }, { data: fotosData }] = await Promise.all([
      supabase.from("produtos").select("nome, marca, descricao, preco_varejo, categorias(nome)").eq("id", dados.produtoId).maybeSingle(),
      supabase.from("produto_variacoes").select("*").eq("produto_id", dados.produtoId).order("nome_combinacao"),
      supabase.from("produto_fotos").select("path, variacao_id").eq("produto_id", dados.produtoId).order("ordem").order("created_at"),
    ]);
    if (!produto) return { ok: false, error: "Produto não encontrado." };

    const variacoes = (variacoesData ?? []) as ProdutoVariacao[];
    // as fotos gerais do produto primeiro, depois as de variação; no máximo 3
    const fotos = [...(fotosData ?? [])].sort((a, b) => Number(a.variacao_id !== null) - Number(b.variacao_id !== null)).slice(0, 3);
    const { data: assinadas } = fotos.length
      ? await supabase.storage.from("produto-fotos").createSignedUrls(fotos.map((f) => f.path), 600)
      : { data: [] };

    const { data: registro, error: erroRegistro } = await supabase
      .from("ia_geracoes")
      .insert({ produto_id: dados.produtoId, canal: CANAL_UNICO, modelo: MODELO_IA })
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
        nome: produto.nome,
        marca: produto.marca,
        categoria: categoria?.nome ?? null,
        descricao: produto.descricao,
        precoVarejo: Number(produto.preco_varejo),
        variacoes,
        fotos: (assinadas ?? []).map((a) => a.signedUrl).filter((u): u is string => !!u),
        perguntas: limparPerguntas(dados.perguntas),
      });
    } catch (e) {
      await admin.from("ia_geracoes").delete().eq("id", registro.id).eq("owner_id", user.id);
      console.error("[ia-anuncio]", e);
      if (e instanceof Anthropic.APIError) return { ok: false, error: motivoDaFalhaDaIA(e) };
      return { ok: false, error: mensagemDeErro(e, "A IA não conseguiu escrever agora. Tente de novo; sua cota não foi usada.") };
    }

    await admin
      .from("ia_geracoes")
      .update({ tokens_entrada: saida.tokensEntrada, tokens_saida: saida.tokensSaida })
      .eq("id", registro.id)
      .eq("owner_id", user.id);

    const uso = await lerUso(supabase);
    return {
      ok: true,
      titulo: cortar(saida.titulo, LIMITE_TITULO),
      descricao: cortar(saida.descricao, LIMITE_DESCRICAO),
      restantes: uso ? restante(uso.iaMes, uso.limites.iaMes) : null,
    };
  } catch (e) {
    return { ok: false, error: mensagemDeErro(e) };
  }
}

// F24: guarda onde o anúncio está publicado (link, data e de quantos em quantos dias renovar): um registro por produto
export async function salvarPublicacao(dados: {
  produtoId: string;
  link: string;
  publicadoEm: string;
  renovarDias: number;
}): Promise<ActionResult> {
  try {
    const link = dados.link.trim();
    if (link && !/^https?:\/\/\S+$/i.test(link)) return { ok: false, error: "O link precisa começar com http:// ou https://." };
    if (link.length > 500) return { ok: false, error: "O link é comprido demais." };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dados.publicadoEm)) return { ok: false, error: "Informe a data da publicação." };
    const dias = Math.round(dados.renovarDias);
    if (!(dias >= 1 && dias <= 365)) return { ok: false, error: "Renovar em quantos dias: de 1 a 365." };

    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return { ok: false, error: "Sua sessão expirou. Entre novamente." };

    const { error } = await supabase.from("anuncio_publicacoes").upsert(
      {
        owner_id: auth.user.id,
        produto_id: dados.produtoId,
        link: link || null,
        publicado_em: dados.publicadoEm,
        renovar_dias: dias,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "produto_id" },
    );
    if (error) return falha(error);

    revalidatePath(`/anuncios/${dados.produtoId}`);
    revalidatePath("/anuncios");
    return ok("Publicação salva.");
  } catch (e) {
    return falha(e);
  }
}

export async function removerPublicacao(produtoId: string): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("anuncio_publicacoes").delete().eq("produto_id", produtoId);
    if (error) return falha(error);
    revalidatePath(`/anuncios/${produtoId}`);
    revalidatePath("/anuncios");
    return ok("Publicação removida.");
  } catch (e) {
    return falha(e);
  }
}
