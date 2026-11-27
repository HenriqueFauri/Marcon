import { after, type NextRequest } from "next/server";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { avisarVenda } from "@/lib/push/eventos";
import { hojeISO } from "@/lib/format";
import { erroDaVenda, totalDaVenda, validarVendaRapida, type VendaRapida } from "@/lib/venda-rapida";

// Venda rápida pela extensão do WhatsApp Web (extensao/, parte 5).
// Quem chama: o service worker da extensão, com o token do próprio dono (Bearer). A rota fica fora
// do proxy de sessão (src/proxy.ts), porque a extensão não tem o cookie do site.
// Segurança: o token é conferido no Supabase Auth (getUser) e todas as consultas rodam com ele,
// então valem as mesmas regras de RLS e de posse do site. Nada de chave de serviço aqui.
// A venda passa pela registrar_venda_unica (migration 0075): mesma chave, mesma venda, sem duplicar.
// O aviso no celular (push) só sai quando a venda foi criada agora, nunca na repetição.

export const maxDuration = 30;

// ID fixo da extensão (extensao/chave.json). Staging e produção usam o mesmo.
const ORIGEM_EXTENSAO = "chrome-extension://paecegdlhpfepcjinghnhgghpkidpfna";
const MAX_CORPO = 20_000;

function cabecalhos(origem: string | null): Record<string, string> {
  const base: Record<string, string> = { "Cache-Control": "no-store", Vary: "Origin" };
  if (origem === ORIGEM_EXTENSAO) {
    base["Access-Control-Allow-Origin"] = ORIGEM_EXTENSAO;
    base["Access-Control-Allow-Methods"] = "POST, OPTIONS";
    base["Access-Control-Allow-Headers"] = "Authorization, Content-Type";
    base["Access-Control-Max-Age"] = "600";
  }
  return base;
}

function resposta(origem: string | null, status: number, corpo: unknown) {
  return Response.json(corpo, { status, headers: cabecalhos(origem) });
}

export function OPTIONS(request: NextRequest) {
  const origem = request.headers.get("origin");
  return new Response(null, { status: origem === ORIGEM_EXTENSAO ? 204 : 403, headers: cabecalhos(origem) });
}

function clienteDoUsuario(token: string): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

export async function POST(request: NextRequest) {
  const origem = request.headers.get("origin");
  // navegador de outro site nunca chama esta rota (sem CORS ele nem leria a resposta)
  if (origem && origem !== ORIGEM_EXTENSAO) return resposta(origem, 403, { ok: false, erro: "Origem não permitida." });

  const auth = request.headers.get("authorization") ?? "";
  const token = /^Bearer ([A-Za-z0-9._-]{20,4096})$/.exec(auth)?.[1];
  if (!token) return resposta(origem, 401, { ok: false, erro: "Sua sessão acabou. Entre de novo." });

  const supabase = clienteDoUsuario(token);
  if (!supabase) return resposta(origem, 500, { ok: false, erro: "O Marcon está fora do ar agora. Tente de novo." });

  const {
    data: { user },
    error: erroUsuario,
  } = await supabase.auth.getUser(token);
  if (erroUsuario || !user) return resposta(origem, 401, { ok: false, erro: "Sua sessão acabou. Entre de novo." });

  const texto = await request.text();
  if (texto.length > MAX_CORPO) return resposta(origem, 413, { ok: false, erro: "Venda grande demais. Registre pelo app." });
  let corpo: unknown;
  try {
    corpo = JSON.parse(texto);
  } catch {
    return resposta(origem, 400, { ok: false, erro: "Pedido inválido." });
  }
  const v = validarVendaRapida(corpo);
  if (!v.ok) return resposta(origem, 400, { ok: false, erro: v.erro });
  const venda = v.dados;

  try {
    const r = await registrar(supabase, user, venda);
    return resposta(origem, r.ok ? 200 : 400, r);
  } catch {
    return resposta(origem, 500, { ok: false, erro: "Não deu para registrar a venda. Tente de novo." });
  }
}

async function registrar(supabase: SupabaseClient, user: User, venda: VendaRapida) {
  // nomes viram snapshot na venda; id de outra conta não é achado (RLS) e a venda é recusada
  const [cliente, canal, forma] = await Promise.all([
    venda.clienteId ? supabase.from("clientes").select("nome").eq("id", venda.clienteId).maybeSingle() : null,
    venda.canalId ? supabase.from("canais_venda").select("nome").eq("id", venda.canalId).maybeSingle() : null,
    venda.formaPagamentoId ? supabase.from("formas_pagamento").select("nome").eq("id", venda.formaPagamentoId).maybeSingle() : null,
  ]);
  if (venda.clienteId && !cliente?.data) return { ok: false as const, erro: "Cliente não encontrado. Busque de novo." };
  if (venda.canalId && !canal?.data) return { ok: false as const, erro: "Canal não encontrado. Atualize o painel." };
  if (venda.formaPagamentoId && !forma?.data) return { ok: false as const, erro: "Forma de pagamento não encontrada. Atualize o painel." };

  const clienteNome = (cliente?.data?.nome as string | undefined) ?? venda.clienteNome;
  const canalNome = (canal?.data?.nome as string | undefined) ?? null;
  const formaNome = (forma?.data?.nome as string | undefined) ?? null;
  // data no fuso do negócio (Brasil), calculada aqui: não depende do relógio de quem chama
  const data = hojeISO();

  const { data: res, error } = await supabase.rpc("registrar_venda_unica", {
    p_chave: venda.chave,
    p_cliente_id: venda.clienteId,
    p_cliente_nome: clienteNome,
    p_itens: venda.itens,
    p_desconto: 0,
    p_tipo_pagamento: "a_vista",
    p_forma_pagamento: formaNome,
    p_canal: canalNome,
    p_data: data,
    p_canal_id: venda.canalId,
    p_forma_pagamento_id: venda.formaPagamentoId,
  });
  if (error) return { ok: false as const, erro: erroDaVenda(error.message) };

  const r = res as { venda_id: string; recibo_token: string; criada: boolean };
  const { data: salva } = await supabase.from("vendas").select("valor_total, custo_total").eq("id", r.venda_id).single();
  const total = salva ? Number(salva.valor_total) : totalDaVenda(venda.itens);

  if (r.criada) {
    after(async () => {
      try {
        const { data: itensVenda } = await supabase.from("venda_itens").select("produto_nome, quantidade").eq("venda_id", r.venda_id);
        await avisarVenda(
          supabase,
          user,
          {
            vendaId: r.venda_id,
            data,
            valor: total,
            lucro: total - Number(salva?.custo_total ?? 0),
            cliente: clienteNome,
            canal: canalNome,
            itens: (itensVenda ?? []).map((i) => ({ nome: i.produto_nome, quantidade: i.quantidade })),
          },
          supabase,
        );
      } catch {
        // aviso é opcional: falhar aqui não pode afetar a venda já registrada
      }
    });
  }

  return { ok: true as const, vendaId: r.venda_id, reciboToken: r.recibo_token, criada: r.criada, total };
}
