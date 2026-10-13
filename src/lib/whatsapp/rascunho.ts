import "server-only";
import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

// Peças comuns a tudo que o assistente LANÇA (venda, produto, estoque, caixa). A regra é a mesma
// para todos e não pode quebrar: o modelo só PREPARA um rascunho; quem grava é o servidor, e só
// quando a mensagem seguinte do vendedor é exatamente um SIM (ver acoes.ts).

export type Db = NonNullable<ReturnType<typeof createAdminClient>>;
export type Entrada = Record<string, unknown>;

export type TipoAcao = "venda" | "produto" | "estoque_entrada" | "estoque_saida" | "caixa_entrada" | "caixa_saida";

export interface ContextoAcao {
  owner: string;
  telefone: string;
  user?: User; // para o aviso (push) da venda, com as preferências de notificação dele
  semConfirmar?: GrupoConfirmavel[]; // grupos em que o vendedor dispensou o SIM (Configurações)
  porAudio?: boolean; // a mensagem veio de voz: a transcrição pode errar
  vozSegura?: boolean; // transcrição com confiança alta e nenhuma palavra em dúvida: só então o SIM pode ser dispensado por voz
}

export const MINUTOS_DO_RASCUNHO = 10;

export const SIM = /^\s*(sim|s|confirmo|confirma|confirmar|pode|pode lan[cç]ar)\s*[.!]?\s*$/i;
// Jeito natural de dizer sim. Só vale quando a ÚLTIMA mensagem do assistente foi o resumo a confirmar
// (acoes.ts): um "ok" dito para outra coisa nunca pode lançar uma venda.
export const SIM_SUAVE =
  /^\s*(isso|isso mesmo|isso a[ií]|ok|okay|beleza|blz|fechou|fechado|certo|t[aá] certo|est[aá] certo|pode mandar|pode registrar|manda ver|lan[cç]a|lan[cç]a a[ií]|registra|confirmado|aham|uhum|positivo|bora)\s*[.!]?\s*$/i;
// Cancelar é o lado seguro: qualquer um destes descarta o rascunho.
export const NAO =
  /^\s*(n[aã]o|n|cancela|cancelar|cancela essa|cancela a venda|deixa|deixa pra l[aá]|deixa quieto|esquece|esque[cç]a|desisti|desisto|n[aã]o quero|melhor n[aã]o|errei|para|nada)\s*[.!]?\s*$/i;

// Grupos que o Marcon liga no servidor com WHATSAPP_LANCAMENTOS (ex.: "produto,estoque,caixa").
// Vazio = só venda, como sempre foi. Venda não entra aqui: ela depende de WHATSAPP_ESCRITA.
export type GrupoDeLancamento = "produto" | "estoque" | "caixa";

const GRUPO_DO_TIPO: Record<Exclude<TipoAcao, "venda">, GrupoDeLancamento> = {
  produto: "produto",
  estoque_entrada: "estoque",
  estoque_saida: "estoque",
  caixa_entrada: "caixa",
  caixa_saida: "caixa",
};

// o que o vendedor pode escolher em Configurações: a venda mais os grupos acima
export type GrupoConfirmavel = "venda" | GrupoDeLancamento;
export const GRUPOS_CONFIRMAVEIS: GrupoConfirmavel[] = ["venda", "produto", "estoque", "caixa"];

export function grupoDoTipo(tipo: TipoAcao): GrupoConfirmavel {
  return tipo === "venda" ? "venda" : GRUPO_DO_TIPO[tipo];
}

export function gruposLiberados(): GrupoDeLancamento[] {
  const validos: GrupoDeLancamento[] = ["produto", "estoque", "caixa"];
  const pedidos = (process.env.WHATSAPP_LANCAMENTOS ?? "").split(",").map((g) => g.trim().toLowerCase());
  return validos.filter((g) => pedidos.includes(g));
}

export function tipoLiberado(tipo: TipoAcao) {
  return tipo === "venda" || gruposLiberados().includes(GRUPO_DO_TIPO[tipo]);
}

// tira o que atrapalha o filtro do PostgREST e limita o tamanho do que veio do modelo
export function termo(v: unknown, max = 60) {
  return String(v ?? "")
    .replace(/[%_,()*\\]/g, " ")
    .trim()
    .slice(0, max);
}

export const r2 = (n: number) => Math.round(n * 100) / 100;
export const igual = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

// Grava o rascunho e devolve o texto que vai direto ao vendedor (o modelo não reescreve, para o
// valor mostrado ser o valor gravado). Um rascunho aberto por número: o novo cancela o anterior.
export async function abrirAcao(db: Db, ctx: ContextoAcao, tipo: TipoAcao, payload: unknown, linhas: (string | null)[]) {
  const resumo = [
    ...linhas.filter((l): l is string => l !== null),
    "",
    `Responda *SIM* para lançar ou *NÃO* para cancelar. Vale por ${MINUTOS_DO_RASCUNHO} minutos.`,
  ].join("\n");

  const agora = new Date().toISOString();
  await db.from("whatsapp_acoes").update({ status: "cancelada", resolvida_em: agora }).eq("telefone", ctx.telefone).eq("status", "pendente");
  const { error } = await db.from("whatsapp_acoes").insert({
    owner_id: ctx.owner,
    telefone: ctx.telefone,
    tipo,
    payload,
    resumo,
    expira_em: new Date(Date.now() + MINUTOS_DO_RASCUNHO * 60_000).toISOString(),
  });
  if (error) throw error;

  return { __resposta_final: resumo };
}
