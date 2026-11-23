"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { falha, ok, texto, type ActionResult } from "@/lib/action";

// Boas-vindas depois do cadastro: só o nome do negócio (o resto fica em Configurações)
export async function salvarNomeDoNegocio(formData: FormData): Promise<ActionResult> {
  try {
    const nomeNegocio = texto(formData, "nome_negocio").slice(0, 80);
    if (!nomeNegocio) return { ok: false, error: "Escreva o nome do negócio." };

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Sua sessão expirou. Entre novamente." };

    const { error } = await supabase.auth.updateUser({ data: { nome_negocio: nomeNegocio } });
    if (error) return falha(error);

    // o nome do negócio aparece na barra lateral de todas as telas
    revalidatePath("/", "layout");
    return ok();
  } catch (e) {
    return falha(e);
  }
}
