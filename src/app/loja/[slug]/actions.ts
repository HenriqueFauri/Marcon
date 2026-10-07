"use server";

import { createClient } from "@/lib/supabase/server";
import { CUPOM_REGEX, SLUG_REGEX, type Cupom } from "@/lib/vitrine";

// Ações da loja pública: rodam sem login e só chamam as funções públicas do banco (migration 0028),
// que conferem se a loja está no ar. Nada aqui lê ou grava dados do vendedor diretamente.

const EXEMPLO = process.env.NODE_ENV !== "production";

export async function validarCupom(slug: string, codigo: string): Promise<Cupom | null> {
  const s = String(slug).toLowerCase();
  const c = String(codigo).trim().toUpperCase();
  if (!SLUG_REGEX.test(s) || !CUPOM_REGEX.test(c)) return null;
  // loja fictícia de desenvolvimento (/loja/exemplo)
  if (EXEMPLO && s === "exemplo") return c === "BEMVINDO10" ? { codigo: c, tipo: "percentual", valor: 10, minimo: 50 } : null;

  const supabase = await createClient();
  const { data } = await supabase.rpc("validar_cupom_vitrine", { p_slug: s, p_codigo: c });
  return (data as Cupom | null) ?? null;
}

const TIPOS = new Set(["visita", "pedido", "produto"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// conta visita, produto aberto e pedido enviado; falha calada, métrica nunca atrapalha a compra
export async function registrarEvento(slug: string, tipo: string, produtoId?: string) {
  try {
    const s = String(slug).toLowerCase();
    if (!SLUG_REGEX.test(s) || !TIPOS.has(tipo) || (EXEMPLO && s === "exemplo")) return;
    if (produtoId !== undefined && !UUID.test(produtoId)) return;
    const supabase = await createClient();
    await supabase.rpc("registrar_evento_vitrine", { p_slug: s, p_tipo: tipo, p_produto: produtoId ?? null });
  } catch {}
}
