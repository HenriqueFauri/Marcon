import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatBRL, hojeISO, somarDias } from "@/lib/format";
import { enviarNotificacao } from "./send";

// Rotina diária das contas a pagar, na mesma rotina das 8h (ver vercel.json: o plano Hobby da Vercel
// aceita só 2 rotinas agendadas, então não ganha uma própria). Um aviso por dono, se houver conta
// vencendo hoje ou amanhã ou já atrasada. Como o aviso das cortesias, não tem chave própria nas
// preferências: só chega a quem ligou as notificações no aparelho.
export async function rotinaDeContas(admin: SupabaseClient) {
  const hoje = hojeISO();
  const amanha = somarDias(hoje, 1);

  const { data, error } = await admin
    .from("contas_a_pagar")
    .select("owner_id, descricao, valor, vencimento")
    .eq("status", "aberta")
    .lte("vencimento", amanha)
    .order("vencimento")
    .limit(5000);
  if (error) throw error;

  const porDono = new Map<string, { descricao: string; valor: number; vencimento: string }[]>();
  for (const c of data ?? []) {
    const lista = porDono.get(c.owner_id) ?? [];
    lista.push({ descricao: c.descricao, valor: Number(c.valor), vencimento: c.vencimento });
    porDono.set(c.owner_id, lista);
  }

  let enviados = 0;
  for (const [ownerId, lista] of porDono) {
    try {
      const atrasadas = lista.filter((c) => c.vencimento < hoje);
      const deHoje = lista.filter((c) => c.vencimento === hoje);
      const deAmanha = lista.filter((c) => c.vencimento === amanha);

      const partes: string[] = [];
      if (deHoje.length) partes.push(`Hoje: ${resumir(deHoje)}`);
      if (deAmanha.length) partes.push(`Amanhã: ${resumir(deAmanha)}`);
      if (atrasadas.length) partes.push(`Atrasada${atrasadas.length > 1 ? "s" : ""}: ${resumir(atrasadas)}`);

      const titulo = deHoje.length
        ? "Conta vence hoje"
        : atrasadas.length
          ? "Conta atrasada"
          : "Conta vence amanhã";
      await enviarNotificacao(ownerId, titulo, partes.join(" · "), "/contas-a-pagar", admin);
      enviados++;
    } catch (e) {
      // um usuário com problema não pode impedir os demais
      console.error("[push] contas a pagar", { ownerId, erro: e instanceof Error ? e.message : String(e) });
    }
  }
  return { usuarios: porDono.size, enviados };
}

function resumir(lista: { descricao: string; valor: number }[]) {
  const total = formatBRL(lista.reduce((s, c) => s + c.valor, 0));
  return lista.length === 1 ? `${lista[0].descricao} ${total}` : `${lista.length} contas, ${total}`;
}
