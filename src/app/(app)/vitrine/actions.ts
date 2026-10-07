"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { falha, numero, ok, texto, textoOuNull, type ActionResult } from "@/lib/action";
import {
  ANUNCIO_MAX,
  BANNER_BOTAO_MAX,
  BANNER_MAX_IMAGENS,
  BANNER_SUBTITULO_MAX,
  BANNER_TITULO_MAX,
  BOAS_VINDAS_MAX,
  COR_PADRAO,
  COR_REGEX,
  CUPOM_REGEX,
  ENTREGAS,
  INSTAGRAM_REGEX,
  SLUG_REGEX,
  normalizarWhatsapp,
} from "@/lib/vitrine";

export async function salvarVitrine(formData: FormData): Promise<ActionResult> {
  try {
    const slug = texto(formData, "slug").toLowerCase();
    const whatsapp = normalizarWhatsapp(texto(formData, "whatsapp"));
    const cor = texto(formData, "cor") || COR_PADRAO;
    const boasVindas = textoOuNull(formData, "boas_vindas");
    const ativa = formData.get("ativa") === "on";
    const anuncio = textoOuNull(formData, "anuncio");
    const entrega = ENTREGAS.find((e) => e.valor === texto(formData, "entrega"))?.valor ?? "ambos";
    const tema = texto(formData, "tema") === "escuro" ? "escuro" : "claro";
    // aceita "@loja", "loja" ou o endereço completo do perfil
    const instagram =
      texto(formData, "instagram")
        .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
        .replace(/^@/, "")
        .replace(/[/?].*$/, "") || null;
    const bannerTitulo = textoOuNull(formData, "banner_titulo");
    const bannerSubtitulo = textoOuNull(formData, "banner_subtitulo");
    const bannerBotao = textoOuNull(formData, "banner_botao");
    const freteBruto = numero(formData, "frete_fixo");
    const frete = entrega === "retirada" ? null : freteBruto;

    if (!SLUG_REGEX.test(slug))
      return { ok: false, error: "O endereço precisa ter de 3 a 40 letras minúsculas, números ou hífen." };
    if (!/^\d{10,15}$/.test(whatsapp)) return { ok: false, error: "Informe o WhatsApp com DDD." };
    if (!COR_REGEX.test(cor)) return { ok: false, error: "Escolha uma cor válida." };
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
    if (frete !== null && (Number.isNaN(frete) || frete < 0 || frete > 9999)) return { ok: false, error: "Confira o valor do frete." };

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Sua sessão expirou. Entre novamente." };

    const { error } = await supabase.from("vitrines").upsert(
      {
        owner_id: user.id,
        slug,
        whatsapp,
        cor,
        boas_vindas: boasVindas,
        ativa,
        anuncio,
        entrega,
        tema,
        instagram,
        banner_titulo: bannerTitulo,
        banner_subtitulo: bannerSubtitulo,
        banner_botao: bannerBotao,
        frete_fixo: frete,
        mostrar_endereco: formData.get("mostrar_endereco") === "on",
        ultimas_unidades: formData.get("ultimas_unidades") === "on",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "owner_id" },
    );
    if (error) {
      if (/duplicate key|unique constraint/i.test(error.message))
        return { ok: false, error: "Esse endereço já está em uso. Escolha outro." };
      return falha(error);
    }

    revalidatePath("/vitrine");
    revalidatePath(`/loja/${slug}`);
    return ok(ativa ? "Vitrine salva e no ar." : "Vitrine salva (desligada).");
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

    revalidatePath("/vitrine");
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

    revalidatePath("/vitrine");
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
    revalidatePath("/vitrine");
    return ok();
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
    revalidatePath("/vitrine");
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
    revalidatePath("/vitrine");
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
    revalidatePath("/vitrine");
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
    revalidatePath("/vitrine");
    return ok("Cupom excluído.");
  } catch (e) {
    return falha(e);
  }
}
