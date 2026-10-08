"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { falha, ok, type ActionResult } from "@/lib/action";
import { assistenteAtivo, contaPodeUsar } from "@/lib/whatsapp/evolution";
import { MINUTOS_DO_CODIGO, gerarCodigo } from "@/lib/whatsapp/vinculo";

function revalidar() {
  revalidatePath("/configuracoes");
  revalidatePath("/configuracoes/whatsapp");
}

// a conversa guardada é do número (whatsapp_conversas, só a chave de serviço mexe):
// antes de apagar, confere pelo RLS que o número é mesmo o vinculado a quem pediu
async function apagarConversaDoNumero(telefone: string) {
  const admin = createAdminClient();
  if (!admin) return;
  await admin.from("whatsapp_conversas").delete().eq("telefone", telefone);
}

// devolve o código no campo id (a tela mostra)
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

    const { data: vinculo } = await supabase.from("whatsapp_vinculos").select("telefone").eq("owner_id", user.id).maybeSingle();
    const { error } = await supabase.from("whatsapp_vinculos").delete().eq("owner_id", user.id);
    if (error) return falha(error);
    if (vinculo) await apagarConversaDoNumero(vinculo.telefone);

    revalidar();
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
    revalidar();
    return ok("WhatsApp vinculado.");
  } catch (e) {
    return falha(e);
  }
}

// interruptor "Lançar vendas por aqui": o RLS e o grant da migration 0041 só deixam mudar esta coluna
export async function alterarLancarVenda(ligado: boolean): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Sua sessão expirou. Entre novamente." };

    const { error } = await supabase.from("whatsapp_vinculos").update({ lancar_venda: ligado === true }).eq("owner_id", user.id);
    if (error) return falha(error);

    revalidar();
    return ok(ligado ? "Lançar venda pelo Zap ligado." : "Lançar venda pelo Zap desligado.");
  } catch (e) {
    return falha(e);
  }
}

export async function apagarConversaWhatsapp(): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Sua sessão expirou. Entre novamente." };

    const { data: vinculo } = await supabase.from("whatsapp_vinculos").select("telefone").eq("owner_id", user.id).maybeSingle();
    if (!vinculo) return { ok: false, error: "Nenhum WhatsApp vinculado." };
    await apagarConversaDoNumero(vinculo.telefone);

    return ok("Conversa apagada. O assistente começa do zero.");
  } catch (e) {
    return falha(e);
  }
}
