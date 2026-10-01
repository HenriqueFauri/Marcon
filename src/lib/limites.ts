import type { User } from "@supabase/supabase-js";
import type { createClient } from "@/lib/supabase/server";
import { ehAdmin } from "@/lib/admin";
import { situacaoDaAssinatura } from "@/lib/assinatura";
import { PLANO_GRATIS } from "@/lib/planos";

type Supabase = Awaited<ReturnType<typeof createClient>>;

// Os limites do plano grátis só valem para quem já passou do teste e não paga.
// Durante o teste, no plano Marcon e na cortesia, tudo é liberado.
async function noPlanoGratis(supabase: Supabase, user: User) {
  if (ehAdmin(user)) return false;
  const { data: linha } = await supabase.from("assinaturas").select("plano, status, proximo_vencimento").maybeSingle();
  const s = situacaoDaAssinatura(linha, user.created_at);
  return s.tipo === "gratis" || (s.tipo === "pendente" && s.diasRestantes === 0);
}

const AVISO = "Assine o plano Marcon em Assinatura para tirar o limite.";

// Devolve a mensagem de erro se criar mais `quantos` produtos passar do limite; null se pode.
export async function limiteDeProdutos(supabase: Supabase, user: User, quantos = 1) {
  if (!(await noPlanoGratis(supabase, user))) return null;
  const { count } = await supabase.from("produtos").select("id", { count: "exact", head: true });
  const max = PLANO_GRATIS.limites.produtos;
  if ((count ?? 0) + quantos <= max) return null;
  return `O plano grátis tem até ${max} produtos. ${AVISO}`;
}

// Mesma coisa para vendas: conta as vendas não canceladas do mês da venda.
export async function limiteDeVendas(supabase: Supabase, user: User, dataDaVenda: string) {
  if (!(await noPlanoGratis(supabase, user))) return null;
  const mes = dataDaVenda.slice(0, 7);
  const [ano, m] = mes.split("-").map(Number);
  const proximo = m === 12 ? `${ano + 1}-01-01` : `${ano}-${String(m + 1).padStart(2, "0")}-01`;
  const { count } = await supabase
    .from("vendas")
    .select("id", { count: "exact", head: true })
    .neq("status", "cancelada")
    .gte("data", `${mes}-01`)
    .lt("data", proximo);
  const max = PLANO_GRATIS.limites.vendasPorMes;
  if ((count ?? 0) < max) return null;
  return `O plano grátis tem até ${max} vendas por mês e este mês já chegou lá. ${AVISO}`;
}
