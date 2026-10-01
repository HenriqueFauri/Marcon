"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { falha, ok, type ActionResult } from "@/lib/action";

// cria (id nulo) ou atualiza uma versão de anúncio de um produto num canal
export async function salvarVersaoAnuncio(dados: {
  id: string | null;
  produtoId: string;
  canalId: string | null;
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
