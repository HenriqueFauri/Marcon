// Respostas prontas do dono e os dados da conta que preenchem as variáveis. Recebe o cliente
// Supabase já logado (RLS por owner_id, como no site). Separada do service worker para dar para
// testar contra o Staging (teste/respostas-staging.ts). Nada aqui lê conversa.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Resposta } from "./mensagens.ts";
import type { DadosDaConta, RespostaPronta } from "./respostas.ts";
import type { TipoMidia } from "./midias.ts";
import type { MidiaResumo, PassoSequencia, Sequencia } from "./sequencias.ts";

// mídia ligada a uma resposta (parte 3): aparece junto dela, com o botão Anexar
export interface MidiaDaResposta {
  id: string;
  tipo: TipoMidia;
  titulo: string;
  resposta_id: string;
}

export interface RespostasDaConta {
  respostas: RespostaPronta[];
  dados: DadosDaConta;
  midias?: MidiaDaResposta[];
  // parte 4: sequências, os passos e o resumo de cada arquivo que um passo usa
  sequencias?: Sequencia[];
  passos?: PassoSequencia[];
  arquivos?: MidiaResumo[];
}

// Link da loja só quando ela está no ar para o cliente: ativa e plano pago ou teste (a mesma regra
// da vitrine_publica), conferido pelo uso_do_plano, que é leve. Guardado por 2 minutos, porque o
// painel recarrega a lista toda vez que volta a ficar visível. Erro não é guardado.
let cacheLink: { ate: number; link: string | null } | null = null;
export function esquecerLinkDaVitrine() {
  cacheLink = null;
}

async function linkDaVitrine(db: SupabaseClient, baseLoja: string): Promise<string | null> {
  if (cacheLink && cacheLink.ate > Date.now()) return cacheLink.link;
  const [{ data: vt, error }, { data: uso, error: erroUso }] = await Promise.all([
    db.from("vitrines").select("slug, ativa").maybeSingle(),
    db.rpc("uso_do_plano"),
  ]);
  if (error || erroUso) return null;
  const plano = (uso as { plano?: string } | null)?.plano;
  const link =
    vt?.ativa && vt.slug && (plano === "pago" || plano === "teste")
      ? `${baseLoja.replace(/\/+$/, "")}/loja/${encodeURIComponent(vt.slug as string)}`
      : null;
  cacheLink = { ate: Date.now() + 2 * 60 * 1000, link };
  return link;
}

export async function carregarRespostas(db: SupabaseClient, baseLoja: string): Promise<Resposta<RespostasDaConta>> {
  const { data: sessao } = await db.auth.getSession();
  if (!sessao.session) return { ok: false, erro: "Sua sessão acabou. Entre de novo." };
  // getUser busca no servidor: pega Pix, endereço e telefone que o dono acabou de mudar no app
  const [{ data: usuario }, lista, vitrine, ligadas, seqs, passos, arquivos] = await Promise.all([
    db.auth.getUser(),
    db.from("respostas_prontas").select("id, titulo, texto, atalho, ordem").order("ordem").order("created_at"),
    linkDaVitrine(db, baseLoja),
    // sem a tabela (banco sem a 0074) ou com erro, as respostas seguem sem mídia
    db.from("midias").select("id, tipo, titulo, resposta_id").not("resposta_id", "is", null).order("created_at"),
    // sem as tabelas (banco sem a 0076) ou com erro, as respostas seguem sem sequências
    db.from("sequencias").select("id, titulo, ordem").order("ordem").order("created_at"),
    db.from("sequencia_passos").select("id, sequencia_id, ordem, texto, resposta_id, midia_id").order("ordem").order("created_at"),
    db.from("midias").select("id, tipo, titulo").limit(200),
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
      midias: ligadas.error ? [] : ((ligadas.data ?? []) as MidiaDaResposta[]),
      sequencias: seqs.error || passos.error ? [] : ((seqs.data ?? []) as Sequencia[]),
      passos: seqs.error || passos.error ? [] : ((passos.data ?? []) as PassoSequencia[]),
      arquivos: arquivos.error ? [] : ((arquivos.data ?? []) as MidiaResumo[]),
    },
  };
}
