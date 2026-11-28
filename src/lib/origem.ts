// De onde veio cada cadastro: marcas do link (utm e ref) e a resposta opcional "como conheceu"
// (migration 0072). Sem imports de servidor: o proxy e as telas também usam.

import { CODIGO_REGEX } from "@/lib/indicacao";

export const COOKIE_ORIGEM = "marcon_origem";

export const OPCOES_COMO_CONHECEU = [
  { valor: "instagram", label: "Instagram" },
  { valor: "tiktok", label: "TikTok" },
  { valor: "youtube", label: "YouTube" },
  { valor: "grupo", label: "Grupo de WhatsApp ou Facebook" },
  { valor: "indicacao", label: "Alguém me indicou" },
  { valor: "google", label: "Pesquisa no Google" },
  { valor: "outro", label: "Outro" },
] as const;
export type ComoConheceu = (typeof OPCOES_COMO_CONHECEU)[number]["valor"];

export function ehComoConheceu(v: unknown): v is ComoConheceu {
  return OPCOES_COMO_CONHECEU.some((o) => o.valor === v);
}

export function rotuloDeComoConheceu(v: string) {
  return OPCOES_COMO_CONHECEU.find((o) => o.valor === v)?.label ?? "Resposta não reconhecida";
}

// o mesmo limite está no banco
const TAMANHO_MAXIMO = 60;

export interface MarcasDoLink {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  ref: string | null;
}

// vem da URL ou do cookie, ou seja, de fora: só letras, números e separadores comuns
function limpar(v: unknown) {
  if (typeof v !== "string") return null;
  const s = v.toLowerCase().replace(/[^\p{L}\p{N} _.+-]/gu, "").trim().slice(0, TAMANHO_MAXIMO);
  return s || null;
}

export function marcasDoLink(ler: (campo: keyof MarcasDoLink) => unknown): MarcasDoLink | null {
  const ref = limpar(ler("ref"));
  const marcas = {
    utm_source: limpar(ler("utm_source")),
    utm_medium: limpar(ler("utm_medium")),
    utm_campaign: limpar(ler("utm_campaign")),
    ref: ref && CODIGO_REGEX.test(ref) ? ref : null,
  };
  return Object.values(marcas).some(Boolean) ? marcas : null;
}

export function lerCookieDeOrigem(valor: string | undefined) {
  if (!valor) return null;
  try {
    const dados: unknown = JSON.parse(valor);
    if (!dados || typeof dados !== "object") return null;
    return marcasDoLink((campo) => (dados as Record<string, unknown>)[campo]);
  } catch {
    return null;
  }
}
