"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { falha, numero, ok, texto, textoOuNull, type ActionResult } from "@/lib/action";
import {
  ANDAMENTOS,
  ANUNCIO_MAX,
  BANNER_BOTAO_MAX,
  BANNER_MAX_IMAGENS,
  BANNER_SUBTITULO_MAX,
  BANNER_TITULO_MAX,
  BOAS_VINDAS_MAX,
  CORES_CLARAS,
  COR_PADRAO,
  COR_REGEX,
  CUPOM_REGEX,
  DESCRICAO_VITRINE_MAX,
  ENTREGAS,
  INSTAGRAM_REGEX,
  SLUG_REGEX,
  type AndamentoDoPedido,
  TITULO_VITRINE_MAX,
  fundoEscuro,
  normalizarWhatsapp,
} from "@/lib/vitrine";

// Configurações da loja: endereço, WhatsApp, no ar, entrega e frete. Cria a vitrine na primeira vez.
export async function salvarConfiguracao(formData: FormData): Promise<ActionResult> {
  try {
    const slug = texto(formData, "slug").toLowerCase();
    const whatsapp = normalizarWhatsapp(texto(formData, "whatsapp"));
    const ativa = formData.get("ativa") === "on";
    const entrega = ENTREGAS.find((e) => e.valor === texto(formData, "entrega"))?.valor ?? "ambos";
    const freteBruto = numero(formData, "frete_fixo");
    const frete = entrega === "retirada" ? null : freteBruto;

    if (!SLUG_REGEX.test(slug))
      return { ok: false, error: "O endereço precisa ter de 3 a 40 letras minúsculas, números ou hífen." };
    if (!/^\d{10,15}$/.test(whatsapp)) return { ok: false, error: "Informe o WhatsApp com DDD." };
    if (frete !== null && (Number.isNaN(frete) || frete < 0 || frete > 9999)) return { ok: false, error: "Confira o valor do frete." };

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Sua sessão expirou. Entre novamente." };

    const { data: anterior } = await supabase.from("vitrines").select("slug").maybeSingle();
    const { error } = await supabase.from("vitrines").upsert(
      { owner_id: user.id, slug, whatsapp, ativa, entrega, frete_fixo: frete, updated_at: new Date().toISOString() },
      { onConflict: "owner_id" },
    );
    if (error) {
      if (/duplicate key|unique constraint/i.test(error.message))
        return { ok: false, error: "Esse endereço já está em uso. Escolha outro." };
      return falha(error);
    }

    revalidatePath("/vitrine", "layout");
    revalidatePath(`/loja/${slug}`);
    if (anterior?.slug && anterior.slug !== slug) revalidatePath(`/loja/${anterior.slug}`);
    if (!anterior) return ok("Loja criada. Agora escolha os produtos e personalize.");
    return ok(ativa ? "Configurações salvas. A loja está no ar." : "Configurações salvas. A loja está desligada.");
  } catch (e) {
    return falha(e);
  }
}

// Personalização: o que aparece na loja (cores, textos, banner, rodapé). Só depois de criada.
export async function salvarPersonalizacao(formData: FormData): Promise<ActionResult> {
  try {
    const cor = texto(formData, "cor") || COR_PADRAO;
    const corBotao = texto(formData, "cor_botao") || cor;
    const corFundo = texto(formData, "cor_fundo") || CORES_CLARAS.fundo;
    const corTexto = texto(formData, "cor_texto") || CORES_CLARAS.texto;
    const corFaixa = texto(formData, "cor_faixa") || cor;
    const boasVindas = textoOuNull(formData, "boas_vindas");
    const anuncio = textoOuNull(formData, "anuncio");
    // aceita "@loja", "loja" ou o endereço completo do perfil
    const instagram =
      texto(formData, "instagram")
        .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
        .replace(/^@/, "")
        .replace(/[/?].*$/, "") || null;
    const bannerTitulo = textoOuNull(formData, "banner_titulo");
    const bannerSubtitulo = textoOuNull(formData, "banner_subtitulo");
    const bannerBotao = textoOuNull(formData, "banner_botao");

    if (![cor, corBotao, corFundo, corTexto, corFaixa].every((c) => COR_REGEX.test(c))) return { ok: false, error: "Escolha cores válidas." };
    if (boasVindas && boasVindas.length > BOAS_VINDAS_MAX)
      return { ok: false, error: `A frase de boas-vindas tem no máximo ${BOAS_VINDAS_MAX} letras.` };
    if (anuncio && anuncio.length > ANUNCIO_MAX)
      return { ok: false, error: `A barra de anúncio tem no máximo ${ANUNCIO_MAX} letras.` };
    if (
      (bannerTitulo && bannerTitulo.length > BANNER_TITULO_MAX) ||
      (bannerSubtitulo && bannerSubtitulo.length > BANNER_SUBTITULO_MAX) ||
      (bannerBotao && bannerBotao.length > BANNER_BOTAO_MAX)
    )
      return { ok: false, error: "Um dos textos do banner passou do limite de letras." };
    if (instagram && !INSTAGRAM_REGEX.test(instagram)) return { ok: false, error: "Confira o usuário do Instagram." };

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Sua sessão expirou. Entre novamente." };

    const { data, error } = await supabase
      .from("vitrines")
      .update({
        cor,
        cor_botao: corBotao,
        cor_fundo: corFundo,
        cor_texto: corTexto,
        cor_faixa: corFaixa,
        // o tema segue o fundo: vale para lojas antigas e para o modo claro ou escuro dos campos do navegador
        tema: fundoEscuro(corFundo) ? "escuro" : "claro",
        boas_vindas: boasVindas,
        anuncio,
        instagram,
        banner_titulo: bannerTitulo,
        banner_subtitulo: bannerSubtitulo,
        banner_botao: bannerBotao,
        mostrar_endereco: formData.get("mostrar_endereco") === "on",
        ultimas_unidades: formData.get("ultimas_unidades") === "on",
        updated_at: new Date().toISOString(),
      })
      .eq("owner_id", user.id)
      .select("slug")
      .maybeSingle();
    if (error) return falha(error);
    if (!data) return { ok: false, error: "Crie sua loja em Configurações antes de personalizar." };

    revalidatePath("/vitrine", "layout");
    revalidatePath(`/loja/${data.slug}`);
    return ok("Personalização salva.");
  } catch (e) {
    return falha(e);
  }
}

// As imagens sobem direto do navegador para o bucket vitrine-banner (pasta do dono); estas ações
// só guardam a lista. O caminho precisa estar na pasta do próprio usuário.
export async function adicionarImagemBanner(path: string): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Sua sessão expirou. Entre novamente." };
    if (!path.startsWith(`${user.id}/`) || path.includes("..")) return { ok: false, error: "Imagem inválida." };

    const { data: atual } = await supabase.from("vitrines").select("banner_paths").maybeSingle();
    if (!atual) return { ok: false, error: "Salve a vitrine antes de enviar imagens do banner." };
    const paths = (atual.banner_paths as string[]) ?? [];
    if (paths.length >= BANNER_MAX_IMAGENS) {
      await supabase.storage.from("vitrine-banner").remove([path]);
      return { ok: false, error: `O banner aceita até ${BANNER_MAX_IMAGENS} imagens.` };
    }

    const { error } = await supabase
      .from("vitrines")
      .update({ banner_paths: [...paths, path], updated_at: new Date().toISOString() })
      .eq("owner_id", user.id);
    if (error) return falha(error);

    revalidatePath("/vitrine", "layout");
    return ok("Imagem adicionada ao banner.");
  } catch (e) {
    return falha(e);
  }
}

export async function removerImagemBanner(path: string): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Sua sessão expirou. Entre novamente." };

    const { data: atual } = await supabase.from("vitrines").select("banner_paths").maybeSingle();
    const paths = ((atual?.banner_paths as string[] | undefined) ?? []).filter((p) => p !== path);
    const { error } = await supabase
      .from("vitrines")
      .update({ banner_paths: paths, updated_at: new Date().toISOString() })
      .eq("owner_id", user.id);
    if (error) return falha(error);
    if (path.startsWith(`${user.id}/`)) await supabase.storage.from("vitrine-banner").remove([path]);

    revalidatePath("/vitrine", "layout");
    return ok("Imagem removida.");
  } catch (e) {
    return falha(e);
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// liga ou desliga vários produtos de uma vez (a lista da página Vitrine); o RLS só deixa mexer nos próprios
export async function definirNaVitrine(ids: string[], valor: boolean): Promise<ActionResult> {
  try {
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > 2000 || !ids.every((id) => UUID.test(id)))
      return { ok: false, error: "Produtos inválidos." };
    const supabase = await createClient();
    const { error } = await supabase
      .from("produtos")
      .update({ na_vitrine: valor === true, updated_at: new Date().toISOString() })
      .in("id", ids);
    if (error) return falha(error);
    revalidatePath("/vitrine", "layout");
    return ok();
  } catch (e) {
    return falha(e);
  }
}

// Como o produto aparece na loja (Vitrine > Produtos > produto). Nada disto mexe no anúncio nem no
// cadastro: foto escondida continua no anúncio, a capa da loja não muda a ordem das fotos e o texto
// da vitrine é próprio (em branco, a loja usa o nome e a descrição do cadastro).
export async function definirFotoNaVitrine(id: string, produtoId: string, valor: boolean): Promise<ActionResult> {
  try {
    if (!UUID.test(id) || !UUID.test(produtoId)) return { ok: false, error: "Foto inválida." };
    const supabase = await createClient();
    const { error } = await supabase
      .from("produto_fotos")
      .update({ na_vitrine: valor === true })
      .eq("id", id)
      .eq("produto_id", produtoId);
    if (error) return falha(error);
    revalidatePath("/vitrine", "layout");
    return ok();
  } catch (e) {
    return falha(e);
  }
}

// fotoId nulo volta para a primeira foto da ordem
export async function definirCapaDaVitrine(produtoId: string, fotoId: string | null): Promise<ActionResult> {
  try {
    if (!UUID.test(produtoId) || (fotoId !== null && !UUID.test(fotoId))) return { ok: false, error: "Foto inválida." };
    const supabase = await createClient();
    if (fotoId) {
      const { data: foto } = await supabase.from("produto_fotos").select("id").eq("id", fotoId).eq("produto_id", produtoId).maybeSingle();
      if (!foto) return { ok: false, error: "Não achei essa foto neste produto." };
    }
    const { error } = await supabase
      .from("produtos")
      .update({ vitrine_capa_id: fotoId, updated_at: new Date().toISOString() })
      .eq("id", produtoId);
    if (error) return falha(error);
    revalidatePath("/vitrine", "layout");
    return ok(fotoId ? "Capa da loja atualizada." : "A capa voltou a ser a primeira foto.");
  } catch (e) {
    return falha(e);
  }
}

export async function salvarTextosDaVitrine(produtoId: string, titulo: string, descricao: string): Promise<ActionResult> {
  try {
    if (!UUID.test(produtoId)) return { ok: false, error: "Produto inválido." };
    const t = String(titulo ?? "").replace(/\s+/g, " ").trim();
    const d = String(descricao ?? "").trim();
    if (t.length > TITULO_VITRINE_MAX) return { ok: false, error: `O título vai até ${TITULO_VITRINE_MAX} caracteres.` };
    if (d.length > DESCRICAO_VITRINE_MAX) return { ok: false, error: `A descrição vai até ${DESCRICAO_VITRINE_MAX} caracteres.` };
    const supabase = await createClient();
    const { error } = await supabase
      .from("produtos")
      .update({ vitrine_titulo: t || null, vitrine_descricao: d || null, updated_at: new Date().toISOString() })
      .eq("id", produtoId);
    if (error) return falha(error);
    revalidatePath("/vitrine", "layout");
    return ok(t || d ? "Texto da loja salvo." : "A loja voltou a usar o nome e a descrição do cadastro.");
  } catch (e) {
    return falha(e);
  }
}

export async function definirDestaque(id: string, valor: boolean): Promise<ActionResult> {
  try {
    if (!UUID.test(id)) return { ok: false, error: "Produto inválido." };
    const supabase = await createClient();
    const { error } = await supabase
      .from("produtos")
      .update({ destaque: valor === true, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return falha(error);
    revalidatePath("/vitrine", "layout");
    return ok();
  } catch (e) {
    return falha(e);
  }
}

export async function criarCupom(formData: FormData): Promise<ActionResult> {
  try {
    const codigo = texto(formData, "codigo").toUpperCase();
    const tipo = texto(formData, "tipo") === "valor" ? "valor" : "percentual";
    const valor = numero(formData, "valor");
    const minimo = numero(formData, "minimo");
    const validade = texto(formData, "validade") || null;

    if (!CUPOM_REGEX.test(codigo)) return { ok: false, error: "O código tem de 3 a 20 letras e números, sem espaço." };
    if (valor === null || Number.isNaN(valor) || valor <= 0) return { ok: false, error: "Informe o valor do desconto." };
    if (tipo === "percentual" && valor > 90) return { ok: false, error: "O desconto percentual vai até 90%." };
    if (minimo !== null && (Number.isNaN(minimo) || minimo <= 0)) return { ok: false, error: "Confira o pedido mínimo." };
    if (validade && !/^\d{4}-\d{2}-\d{2}$/.test(validade)) return { ok: false, error: "Confira a validade." };

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Sua sessão expirou. Entre novamente." };

    const { error } = await supabase
      .from("vitrine_cupons")
      .insert({ owner_id: user.id, codigo, tipo, valor, minimo, validade });
    if (error) {
      if (/duplicate key|unique constraint/i.test(error.message)) return { ok: false, error: "Você já tem um cupom com esse código." };
      return falha(error);
    }
    revalidatePath("/vitrine", "layout");
    return ok(`Cupom ${codigo} criado.`);
  } catch (e) {
    return falha(e);
  }
}

export async function alternarCupom(id: string, ativo: boolean): Promise<ActionResult> {
  try {
    if (!UUID.test(id)) return { ok: false, error: "Cupom inválido." };
    const supabase = await createClient();
    const { error } = await supabase.from("vitrine_cupons").update({ ativo: ativo === true }).eq("id", id);
    if (error) return falha(error);
    revalidatePath("/vitrine", "layout");
    return ok(ativo ? "Cupom ligado." : "Cupom desligado.");
  } catch (e) {
    return falha(e);
  }
}

export async function excluirCupom(id: string): Promise<ActionResult> {
  try {
    if (!UUID.test(id)) return { ok: false, error: "Cupom inválido." };
    const supabase = await createClient();
    const { error } = await supabase.from("vitrine_cupons").delete().eq("id", id);
    if (error) return falha(error);
    revalidatePath("/vitrine", "layout");
    return ok("Cupom excluído.");
  } catch (e) {
    return falha(e);
  }
}

// Pedidos recebidos (migration 0037): descartar (o cliente desistiu) ou voltar para "novo".
// "vendido" só vem de registrarVenda, que guarda junto o id da venda.
export async function mudarStatusDoPedido(id: string, status: "novo" | "descartado"): Promise<ActionResult> {
  try {
    if (status !== "novo" && status !== "descartado") return { ok: false, error: "Status inválido." };
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("vitrine_pedidos")
      .update({ status })
      .eq("id", id)
      .neq("status", "vendido")
      .select("id")
      .maybeSingle();
    if (error) return falha(error);
    if (!data) return { ok: false, error: "Não achei esse pedido, ou ele já virou venda." };
    revalidatePath("/vitrine", "layout");
    return ok(status === "descartado" ? "Pedido descartado." : "Pedido de volta para os novos.");
  } catch (e) {
    return falha(e);
  }
}

// Andamento do pedido para o cliente (migration 0052): recebido, separado, saiu. Separar ou despachar
// também segura a reserva das unidades até virar venda ou ser descartado (sem isso ela vale 48 horas).
export async function mudarAndamentoDoPedido(id: string, andamento: string): Promise<ActionResult> {
  try {
    if (!UUID.test(id) || !ANDAMENTOS.includes(andamento as AndamentoDoPedido)) return { ok: false, error: "Andamento inválido." };
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("vitrine_pedidos")
      .update({ andamento, andamento_em: new Date().toISOString() })
      .eq("id", id)
      .eq("status", "novo")
      .select("id")
      .maybeSingle();
    if (error) return falha(error);
    if (!data) return { ok: false, error: "Não achei esse pedido, ou ele já foi encerrado." };
    revalidatePath("/vitrine", "layout");
    return ok("Andamento atualizado.");
  } catch (e) {
    return falha(e);
  }
}

// Frete por região (migration 0052): o cliente escolhe a região no pedido. Quem não escolhe uma da lista
// usa o frete fixo das configurações (ou "a combinar").
const REGIOES_MAX = 40;

export async function criarRegiaoDeFrete(formData: FormData): Promise<ActionResult> {
  try {
    const nome = texto(formData, "nome").replace(/\s+/g, " ");
    const valor = numero(formData, "valor") ?? 0;
    if (!nome || nome.length > 60) return { ok: false, error: "Informe o bairro ou a região (até 60 letras)." };
    if (Number.isNaN(valor) || valor < 0 || valor > 9999) return { ok: false, error: "Confira o valor do frete." };

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Sua sessão expirou. Entre novamente." };

    const { count } = await supabase.from("vitrine_regioes_frete").select("id", { count: "exact", head: true });
    if ((count ?? 0) >= REGIOES_MAX) return { ok: false, error: `Você pode ter até ${REGIOES_MAX} regiões.` };

    const { error } = await supabase.from("vitrine_regioes_frete").insert({ owner_id: user.id, nome, valor });
    if (error) {
      if (/duplicate key|unique constraint/i.test(error.message)) return { ok: false, error: "Você já tem uma região com esse nome." };
      return falha(error);
    }
    revalidatePath("/vitrine", "layout");
    revalidatePath("/loja/[slug]", "page");
    return ok(`${nome} adicionada.`);
  } catch (e) {
    return falha(e);
  }
}

export async function excluirRegiaoDeFrete(id: string): Promise<ActionResult> {
  try {
    if (!UUID.test(id)) return { ok: false, error: "Região inválida." };
    const supabase = await createClient();
    const { error } = await supabase.from("vitrine_regioes_frete").delete().eq("id", id);
    if (error) return falha(error);
    revalidatePath("/vitrine", "layout");
    revalidatePath("/loja/[slug]", "page");
    return ok("Região removida.");
  } catch (e) {
    return falha(e);
  }
}
