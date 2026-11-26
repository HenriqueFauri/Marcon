// Respostas prontas do dono e os dados da conta que preenchem as variáveis. Recebe o cliente
// Supabase já logado (RLS por owner_id, como no site). Separada do service worker para dar para
// testar contra o Staging (teste/respostas-staging.ts). Nada aqui lê conversa.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Resposta } from "./mensagens.ts";
import type { DadosDaConta, RespostaPronta } from "./respostas.ts";

export interface RespostasDaConta {
  respostas: RespostaPronta[];
  dados: DadosDaConta;
}

// link da loja só quando ela está no ar para o cliente (a vitrine_publica devolve a loja)
async function linkDaVitrine(db: SupabaseClient, baseLoja: string): Promise<string | null> {
  const { data: vt, error } = await db.from("vitrines").select("slug, ativa").maybeSingle();
  if (error || !vt?.ativa || !vt.slug) return null;
  const { data, error: erroLoja } = await db.rpc("vitrine_publica", { p_slug: vt.slug });
  if (erroLoja || !data) return null;
  return `${baseLoja.replace(/\/+$/, "")}/loja/${encodeURIComponent(vt.slug as string)}`;
}

export async function carregarRespostas(db: SupabaseClient, baseLoja: string): Promise<Resposta<RespostasDaConta>> {
  const { data: sessao } = await db.auth.getSession();
  if (!sessao.session) return { ok: false, erro: "Sua sessão acabou. Entre de novo." };
  // getUser busca no servidor: pega Pix, endereço e telefone que o dono acabou de mudar no app
  const [{ data: usuario }, lista, vitrine] = await Promise.all([
    db.auth.getUser(),
    db.from("respostas_prontas").select("id, titulo, texto, atalho, ordem").order("ordem").order("created_at"),
    linkDaVitrine(db, baseLoja),
  ]);
  if (lista.error) return { ok: false, erro: "Não deu para carregar as respostas. Tente de novo." };
  const meta = (usuario.user?.user_metadata ?? sessao.session.user.user_metadata ?? {}) as Record<string, unknown>;
  const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
  return {
    ok: true,
    dados: {
      respostas: (lista.data ?? []) as RespostaPronta[],
      dados: {
        negocio: texto(meta.nome_negocio),
        pix: texto(meta.empresa_pix),
        endereco: texto(meta.empresa_endereco),
        telefone: texto(meta.empresa_telefone),
        vitrine,
      },
    },
  };
}
