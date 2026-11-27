// Venda rápida, lado do service worker. Lê formas de pagamento, canais e clientes da conta (RLS do
// dono, igual ao site) e manda a venda para a rota /api/extensao/venda com o token do dono.
// Separada do sw.ts para dar para testar contra o Staging (teste/venda-staging.ts).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Resposta } from "./mensagens.ts";
import type { ClienteBusca, VendaRapida } from "../../src/lib/venda-rapida.ts";

export * from "../../src/lib/venda-rapida.ts";

export interface Opcao {
  id: string;
  nome: string;
}

export interface DadosDaVenda {
  formas: Opcao[];
  canais: Opcao[];
  clientes: ClienteBusca[];
}

export interface VendaFeita {
  vendaId: string;
  reciboToken: string;
  criada: boolean;
  total: number;
}

// "incerto": a venda pode ter entrado (a rede caiu depois do envio). Tentar de novo com a mesma
// chave é seguro: se ela já entrou, volta a mesma venda.
export type RespostaVenda = Resposta<VendaFeita> | { ok: false; erro: string; incerto: true };

const MAX_CLIENTES = 2000;

export async function carregarDadosDaVenda(db: SupabaseClient): Promise<Resposta<DadosDaVenda>> {
  const { data: sessao } = await db.auth.getSession();
  if (!sessao.session) return { ok: false, erro: "Sua sessão acabou. Entre de novo." };
  const [formas, canais, clientes] = await Promise.all([
    db.from("formas_pagamento").select("id, nome").order("nome"),
    db.from("canais_venda").select("id, nome").order("nome"),
    db.from("clientes").select("id, nome, telefone").order("nome").limit(MAX_CLIENTES),
  ]);
  if (formas.error || canais.error || clientes.error) return { ok: false, erro: "Não deu para carregar agora. Tente de novo." };
  return {
    ok: true,
    dados: {
      formas: (formas.data ?? []) as Opcao[],
      canais: (canais.data ?? []) as Opcao[],
      clientes: (clientes.data ?? []) as ClienteBusca[],
    },
  };
}

export async function enviarVenda(db: SupabaseClient, base: string, venda: VendaRapida): Promise<RespostaVenda> {
  const { data: sessao } = await db.auth.getSession(); // renova o token vencido antes de mandar
  const token = sessao.session?.access_token;
  if (!token) return { ok: false, erro: "Sua sessão acabou. Entre de novo." };

  let r: Response;
  try {
    r = await fetch(`${base.replace(/\/+$/, "")}/api/extensao/venda`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(venda),
      signal: AbortSignal.timeout(25_000),
    });
  } catch {
    return { ok: false, incerto: true, erro: "Sem resposta do Marcon. Tente de novo: se a venda já entrou, ela não duplica." };
  }

  let corpo: { ok?: boolean; erro?: string; vendaId?: string; reciboToken?: string; criada?: boolean; total?: number } | null = null;
  try {
    corpo = await r.json();
  } catch {
    corpo = null;
  }
  if (r.status === 401) return { ok: false, erro: "Sua sessão acabou. Entre de novo." };
  if (r.ok && corpo?.ok && corpo.vendaId && corpo.reciboToken) {
    return { ok: true, dados: { vendaId: corpo.vendaId, reciboToken: corpo.reciboToken, criada: corpo.criada === true, total: Number(corpo.total) || 0 } };
  }
  // 5xx sem resposta clara: pode ter entrado ou não
  if (r.status >= 500 || !corpo) {
    return { ok: false, incerto: true, erro: "O Marcon não confirmou a venda. Tente de novo: se ela já entrou, não duplica." };
  }
  return { ok: false, erro: corpo.erro || "Não deu para registrar a venda. Tente de novo." };
}
