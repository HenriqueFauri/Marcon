// Dados da conta para o topo e o rodapé do painel, com as mesmas regras do app
// (src/app/(app)/layout.tsx): nome do negócio, nome do dono com os mesmos fallbacks e o selo do plano
// calculado por src/lib/assinatura.ts (o mesmo arquivo do app). RLS: só a assinatura do próprio dono.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Resposta } from "./mensagens.ts";
import { rotuloDaSituacao, situacaoDaAssinatura } from "../../src/lib/assinatura.ts";

export interface DadosConta {
  email: string;
  nomeNegocio: string;
  nome: string;
  plano: { texto: string; tom: "neutral" | "positive" | "warning" | "info" } | null;
}

export async function dadosDaConta(db: SupabaseClient): Promise<Resposta<DadosConta>> {
  const { data: sessao } = await db.auth.getSession();
  if (!sessao.session) return { ok: false, erro: "Sua sessão acabou. Entre de novo." };
  const [{ data: u }, { data: linha, error }] = await Promise.all([
    db.auth.getUser(),
    db.from("assinaturas").select("plano, status, proximo_vencimento, cortesia_ate, cortesia_em").maybeSingle(),
  ]);
  const user = u.user ?? sessao.session.user;
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const texto = (v: unknown) => (typeof v === "string" && v ? v : undefined);
  return {
    ok: true,
    dados: {
      email: user.email ?? "",
      nomeNegocio: texto(meta.nome_negocio) || "Meu negócio",
      nome: texto(meta.nome) ?? texto(meta.full_name) ?? texto(meta.name) ?? user.email ?? "",
      // sem conseguir ler a assinatura agora: sem selo, em vez de um selo errado
      plano: error ? null : rotuloDaSituacao(situacaoDaAssinatura(linha, user.created_at)),
    },
  };
}
