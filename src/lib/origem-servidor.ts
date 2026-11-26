import "server-only";
import { cookies } from "next/headers";
import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { COOKIE_ORIGEM, lerCookieDeOrigem, type ComoConheceu } from "@/lib/origem";

// mesma janela da indicação: quem já usava o Marcon não ganha origem ao abrir um link marcado depois
const JANELA_DO_CADASTRO_MS = 2 * 24 * 60 * 60 * 1000;

export function contaRecente(user: Pick<User, "created_at">) {
  return Date.now() - new Date(user.created_at).getTime() <= JANELA_DO_CADASTRO_MS;
}

// Grava as marcas do link guardadas no cookie. Chamar logo depois do cadastro.
// Nunca lança: medir a origem não pode atrapalhar o login.
export async function registrarOrigem(user: Pick<User, "id" | "created_at">) {
  try {
    const jar = await cookies();
    const guardado = jar.get(COOKIE_ORIGEM)?.value;
    if (!guardado) return;
    const marcas = lerCookieDeOrigem(guardado);
    if (!marcas || !contaRecente(user)) {
      jar.delete(COOKIE_ORIGEM);
      return;
    }

    const admin = createAdminClient();
    if (!admin) return;
    // vale a primeira: uma conta que já tem linha não é sobrescrita
    const { error } = await admin
      .from("cadastro_origem")
      .upsert({ owner_id: user.id, ...marcas }, { onConflict: "owner_id", ignoreDuplicates: true });
    if (error) throw error;
    // só apaga depois de gravar: se o banco falhar, o próximo retorno do login tenta de novo
    jar.delete(COOKIE_ORIGEM);
  } catch (e) {
    console.error("[origem] não consegui registrar", e);
  }
}

// resposta de "como conheceu" (null apaga); mexe só nessa coluna, as marcas do link ficam
export async function gravarComoConheceu(ownerId: string, resposta: ComoConheceu | null) {
  const admin = createAdminClient();
  if (!admin) return;
  const { error } = await admin
    .from("cadastro_origem")
    .upsert({ owner_id: ownerId, como_conheceu: resposta }, { onConflict: "owner_id" });
  if (error) throw error;
}
