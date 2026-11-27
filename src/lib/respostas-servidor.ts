import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { DadosDaConta } from "@/lib/respostas";

// Valores das variáveis das respostas prontas, com o que a conta já tem: Configurações (nome do
// negócio, Pix, endereço e telefone) e o link da vitrine só quando ela está no ar para o cliente:
// ativa e plano pago ou teste, a mesma regra da vitrine_publica, conferida pelo uso_do_plano (leve,
// sem baixar o catálogo).
export async function dadosDaConta(supabase: SupabaseClient, user: User, base: string): Promise<DadosDaConta> {
  const meta = user.user_metadata ?? {};
  let vitrine: string | null = null;
  const [{ data: vt }, { data: uso }] = await Promise.all([
    supabase.from("vitrines").select("slug, ativa").maybeSingle(),
    supabase.rpc("uso_do_plano"),
  ]);
  const plano = (uso as { plano?: string } | null)?.plano;
  if (vt?.ativa && vt.slug && (plano === "pago" || plano === "teste")) {
    vitrine = `${base.replace(/\/+$/, "")}/loja/${encodeURIComponent(vt.slug as string)}`;
  }
  return {
    negocio: (meta.nome_negocio as string | undefined) ?? null,
    pix: (meta.empresa_pix as string | undefined) ?? null,
    endereco: (meta.empresa_endereco as string | undefined) ?? null,
    telefone: (meta.empresa_telefone as string | undefined) ?? null,
    vitrine,
  };
}
