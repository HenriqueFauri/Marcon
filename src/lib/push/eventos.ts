import type { SupabaseClient, User } from "@supabase/supabase-js";
import { hojeISO, mesAtual } from "@/lib/format";
import { enviarNotificacao } from "@/lib/push/send";
import {
  NIVEIS,
  eventoAtivo,
  lerPreferencias,
  renderizar,
  textoDoEvento,
  valoresDaCobranca,
  valoresDaMeta,
  valoresDaVenda,
  valoresDoNivel,
  type DadosVendaNotificacao,
  type Evento,
  type ParcelaParaCobrar,
  type PreferenciaNotificacao,
} from "@/lib/notificacao-modelos";

async function enviarEvento(
  ownerId: string,
  pref: PreferenciaNotificacao,
  evento: Evento,
  valores: Record<string, string>,
  url: string,
  cliente?: SupabaseClient,
) {
  if (!eventoAtivo(pref, evento)) return;
  const { titulo, corpo } = textoDoEvento(pref, evento);
  const r = renderizar(titulo, corpo, valores);
  await enviarNotificacao(ownerId, r.titulo, r.corpo, url, cliente);
}

interface VendaRegistrada extends DadosVendaNotificacao {
  vendaId: string;
  data: string; // YYYY-MM-DD
}

// Depois de registrar uma venda: avisa a venda e, se ela empurrou o mês por
// cima da meta ou de um nível de faturamento, avisa a conquista também.
export async function avisarVenda(supabase: SupabaseClient, user: User, venda: VendaRegistrada) {
  const pref = lerPreferencias(user.user_metadata);
  const url = `/vendas/${venda.vendaId}`;
  await enviarEvento(user.id, pref, "venda", valoresDaVenda(venda), url);

  // só vendas do mês corrente contam para meta e níveis
  const mes = mesAtual();
  if (venda.data.slice(0, 7) !== mes) return;
  if (!eventoAtivo(pref, "meta") && !eventoAtivo(pref, "nivel_1k")) return;

  const { data: doMes } = await supabase
    .from("vendas")
    .select("valor_total, custo_total")
    .gte("data", `${mes}-01`)
    .lt("data", primeiroDiaDoProximoMes(mes))
    .neq("status", "cancelada");
  const faturamento = (doMes ?? []).reduce((s, v) => s + Number(v.valor_total), 0);
  const lucro = (doMes ?? []).reduce((s, v) => s + Number(v.valor_total) - Number(v.custo_total), 0);
  const faturamentoAntes = faturamento - venda.valor;
  const lucroAntes = lucro - venda.lucro;

  const meta = user.user_metadata ?? {};
  const cruzou = (antes: number, depois: number, alvo: unknown) =>
    typeof alvo === "number" && alvo > 0 && antes < alvo && depois >= alvo;

  if (cruzou(faturamentoAntes, faturamento, meta.meta_vendas)) {
    await enviarEvento(
      user.id,
      pref,
      "meta",
      valoresDaMeta({ tipo: "vendas", meta: meta.meta_vendas as number, atingido: faturamento, mes }),
      "/",
    );
  }
  if (cruzou(lucroAntes, lucro, meta.meta_lucro)) {
    await enviarEvento(
      user.id,
      pref,
      "meta",
      valoresDaMeta({ tipo: "lucro", meta: meta.meta_lucro as number, atingido: lucro, mes }),
      "/",
    );
  }

  // uma venda grande pode pular níveis: avisa só o mais alto
  const nivel = [...NIVEIS].reverse().find((n) => faturamentoAntes < n.valor && faturamento >= n.valor);
  if (nivel) {
    await enviarEvento(user.id, pref, nivel.evento, valoresDoNivel({ nivel: nivel.valor, faturamento, mes }), "/");
  }
}

function primeiroDiaDoProximoMes(mes: string) {
  const [ano, m] = mes.split("-").map(Number);
  return m === 12 ? `${ano + 1}-01-01` : `${ano}-${String(m + 1).padStart(2, "0")}-01`;
}

function diasEntre(deISO: string, ateISO: string) {
  return Math.round((Date.parse(`${ateISO}T00:00:00Z`) - Date.parse(`${deISO}T00:00:00Z`)) / 86_400_000);
}

// Rotina diária: um resumo por usuário com as parcelas que vencem hoje ou já
// venceram. Roda sem sessão, por isso usa o cliente de serviço.
export async function enviarCobrancasDoDia(admin: SupabaseClient) {
  const hoje = hojeISO();
  const { data: parcelas, error } = await admin
    .from("parcelas")
    .select("owner_id, valor, vencimento, vendas(cliente_nome)")
    .neq("status", "pago")
    .lte("vencimento", hoje);
  if (error) throw error;

  const porDono = new Map<string, ParcelaParaCobrar[]>();
  for (const p of parcelas ?? []) {
    const venda = p.vendas as unknown as { cliente_nome: string | null } | null;
    const lista = porDono.get(p.owner_id) ?? [];
    lista.push({ cliente: venda?.cliente_nome ?? null, valor: Number(p.valor), diasAtraso: diasEntre(p.vencimento, hoje) });
    porDono.set(p.owner_id, lista);
  }

  let enviados = 0;
  for (const [ownerId, lista] of porDono) {
    try {
      const { data } = await admin.auth.admin.getUserById(ownerId);
      const pref = lerPreferencias(data.user?.user_metadata);
      if (!eventoAtivo(pref, "cobranca")) continue;
      await enviarEvento(ownerId, pref, "cobranca", valoresDaCobranca(lista), "/contas-a-receber", admin);
      enviados++;
    } catch {
      // um usuário com problema não pode impedir os demais
    }
  }
  return { usuarios: porDono.size, enviados };
}
