"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { falha, numero, ok, texto, textoOuNull, type ActionResult } from "@/lib/action";
import {
  ANUNCIO_MAX,
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
