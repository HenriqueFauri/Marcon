"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { falha, ok, type ActionResult } from "@/lib/action";
import { assistenteAtivo, contaPodeUsar } from "@/lib/whatsapp/evolution";
import { MINUTOS_DO_CODIGO, gerarCodigo } from "@/lib/whatsapp/vinculo";

// devolve o código no campo id (o formulário mostra na tela)
export async function gerarCodigoWhatsapp(): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Sua sessão expirou. Entre novamente." };
    if (!assistenteAtivo() || !contaPodeUsar(user.email)) return { ok: false, error: "O assistente ainda não está liberado para a sua conta." };

    // um código aberto por vez: o anterior deixa de valer
    await supabase.from("whatsapp_codigos").delete().eq("owner_id", user.id);

    const codigo = gerarCodigo();
    const { error } = await supabase.from("whatsapp_codigos").insert({
      codigo,
      owner_id: user.id,
      expira_em: new Date(Date.now() + MINUTOS_DO_CODIGO * 60_000).toISOString(),
    });
    if (error) return falha(error);

    return { ok: true, id: codigo };
  } catch (e) {
    return falha(e);
  }
}

export async function desvincularWhatsapp(): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Sua sessão expirou. Entre novamente." };

    const { error } = await supabase.from("whatsapp_vinculos").delete().eq("owner_id", user.id);
    if (error) return falha(error);

    revalidatePath("/configuracoes");
    return ok("WhatsApp desvinculado.");
  } catch (e) {
    return falha(e);
  }
}

// a página recarrega para mostrar o vínculo depois que o código chegou no WhatsApp
export async function conferirVinculoWhatsapp(): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { data } = await supabase.from("whatsapp_vinculos").select("owner_id").maybeSingle();
    if (!data) return ok("Ainda não chegou. Confira se mandou a mensagem.");
    revalidatePath("/configuracoes");
    return ok("WhatsApp vinculado.");
  } catch (e) {
    return falha(e);
  }
}
