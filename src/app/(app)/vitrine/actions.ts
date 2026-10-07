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
