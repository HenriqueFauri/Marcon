"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { CUPOM_REGEX, SLUG_REGEX, type Cupom } from "@/lib/vitrine";
import { avisarPedidoDaVitrine } from "@/lib/push/eventos";

// Ações da loja pública: rodam sem login. As funções do banco (migrations 0028 e 0034) só aceitam a chave de
// serviço, então a chamada passa por aqui, onde o limite por IP é aplicado antes. Nada aqui lê ou grava
// dados do vendedor diretamente, e as funções conferem se a loja está no ar.

const EXEMPLO = process.env.NODE_ENV !== "production";

// janela de 10 minutos por visitante e loja
const JANELA_SEGUNDOS = 600;
const MAX_CUPONS = 10;
const MAX_EVENTOS = 60;

// a Vercel preenche x-forwarded-for com o IP de quem abriu a loja (o primeiro da lista)
async function ipDoVisitante() {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "desconhecido").trim();
}

async function dentroDoLimite(admin: NonNullable<ReturnType<typeof createAdminClient>>, chave: string, max: number) {
  const { data, error } = await admin.rpc("consumir_limite", { p_chave: chave, p_max: max, p_segundos: JANELA_SEGUNDOS });
  return !error && data === true;
}

export async function validarCupom(slug: string, codigo: string): Promise<Cupom | null> {
  const s = String(slug).toLowerCase();
  const c = String(codigo).trim().toUpperCase();
  if (!SLUG_REGEX.test(s) || !CUPOM_REGEX.test(c)) return null;
  // loja fictícia de desenvolvimento (/loja/exemplo)
  if (EXEMPLO && s === "exemplo") return c === "BEMVINDO10" ? { codigo: c, tipo: "percentual", valor: 10, minimo: 50 } : null;

  const admin = createAdminClient();
  if (!admin) return null;
  // muitas tentativas de código seguidas: trata como cupom inválido
  if (!(await dentroDoLimite(admin, `cupom:${await ipDoVisitante()}:${s}`, MAX_CUPONS))) return null;

  const { data } = await admin.rpc("validar_cupom_vitrine", { p_slug: s, p_codigo: c });
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

    const admin = createAdminClient();
    if (!admin) return;
    if (!(await dentroDoLimite(admin, `evento:${await ipDoVisitante()}:${s}`, MAX_EVENTOS))) return;

    // o dono, logado, abrindo a própria loja para conferir não conta (a função não enxerga o login do visitante)
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    await admin.rpc("registrar_evento_vitrine", {
      p_slug: s,
      p_tipo: tipo,
      p_produto: produtoId ?? null,
      p_ignorar: user?.id ?? null,
    });
  } catch {}
}

const MAX_PEDIDOS = 10;
const CODIGO = /^[A-Z0-9]{4,8}$/;

export interface PedidoDaLoja {
  codigo: string;
  itens: { produtoId: string; variacaoId: string | null; quantidade: number }[];
  clienteNome: string;
  entrega: "entrega" | "retirada";
  endereco: string;
  pagamento: string;
  cupom: string | null;
  regiaoId?: string | null;
}

// "estoque": algum item não cabe mais (outro cliente reservou antes); "erro": não deu para gravar
// (limite, banco fora do ar), e o pedido segue pelo WhatsApp como antes.
export type ResultadoDoPedido =
  | { ok: true; token: string }
  | { ok: false; motivo: "estoque"; itens: { produtoId: string; variacaoId: string | null; disponivel: number }[] }
  | { ok: false; motivo: "erro" };

// Grava o pedido em vitrine_pedidos (migrations 0037 e 0052), reserva as unidades e conta na métrica de
// pedidos. O banco refaz preço, cupom, frete e total a partir dos ids; daqui só vão ids, quantidades e
// os dados de entrega. Só o motivo "estoque" segura o pedido; qualquer outra falha deixa seguir pelo WhatsApp.
export async function registrarPedido(slug: string, pedido: PedidoDaLoja): Promise<ResultadoDoPedido> {
  const erro = { ok: false, motivo: "erro" } as const;
  try {
    const s = String(slug).toLowerCase();
    if (!SLUG_REGEX.test(s) || (EXEMPLO && s === "exemplo") || !CODIGO.test(pedido.codigo)) return erro;
    const itens = (pedido.itens ?? []).slice(0, 50).filter(
      (i) => UUID.test(i.produtoId) && (i.variacaoId === null || UUID.test(i.variacaoId)) && Number.isInteger(i.quantidade),
    );
    if (itens.length === 0) return erro;

    const admin = createAdminClient();
    if (!admin) return erro;
    if (!(await dentroDoLimite(admin, `pedido:${await ipDoVisitante()}:${s}`, MAX_PEDIDOS))) return erro;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data, error } = await admin.rpc("registrar_pedido_vitrine", {
      p_slug: s,
      p_codigo: pedido.codigo,
      p_itens: itens.map((i) => ({ produto_id: i.produtoId, variacao_id: i.variacaoId, quantidade: Math.min(Math.max(i.quantidade, 1), 99) })),
      p_dados: {
        cliente_nome: String(pedido.clienteNome ?? "").slice(0, 80),
        entrega: pedido.entrega === "retirada" ? "retirada" : "entrega",
        endereco: String(pedido.endereco ?? "").slice(0, 300),
        pagamento: String(pedido.pagamento ?? "").slice(0, 60),
        cupom: pedido.cupom && CUPOM_REGEX.test(pedido.cupom) ? pedido.cupom : null,
        regiao_id: pedido.regiaoId && UUID.test(pedido.regiaoId) ? pedido.regiaoId : null,
      },
      p_ignorar: user?.id ?? null,
    });
    if (error || !data) return erro;
    const r = data as {
      ok: boolean;
      repetido?: boolean;
      token?: string;
      motivo?: string;
      itens?: { produto_id: string; variacao_id: string | null; disponivel: number }[];
    };
    if (r.ok && r.token) {
      // aviso (push) ao dono da loja; opcional, nunca atrapalha o pedido
      if (!r.repetido) await avisarPedidoDaVitrine(admin, s, pedido.codigo).catch((e) => console.error("[push] aviso de pedido da vitrine", e));
      return { ok: true, token: r.token };
    }
    if (r.motivo === "estoque")
      return {
        ok: false,
        motivo: "estoque",
        itens: (r.itens ?? []).map((i) => ({ produtoId: i.produto_id, variacaoId: i.variacao_id, disponivel: Number(i.disponivel) })),
      };
    return erro;
  } catch {
    return erro;
  }
}
