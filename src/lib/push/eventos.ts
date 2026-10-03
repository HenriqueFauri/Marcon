import type { SupabaseClient, User } from "@supabase/supabase-js";
import { hojeISO, mesAtual } from "@/lib/format";
import { enviarNotificacao } from "@/lib/push/send";
import {
  NIVEIS,
  eventoAtivo,
  lerPreferencias,
  linhaDaCobranca,
  linhaDaMeta,
  linhaDaVenda,
  linhaDoNivel,
  montarNotificacao,
  type DadosVendaNotificacao,
  type Evento,
  type ParcelaParaCobrar,
  type Preferencias,
} from "@/lib/notificacoes";

async function enviarEvento(
  ownerId: string,
  pref: Preferencias,
  evento: Evento,
  posicao: number,
  linhaDeDados: string,
  url: string,
  cliente?: SupabaseClient,
) {
  if (!eventoAtivo(pref, evento)) return;
  const { titulo, corpo } = montarNotificacao(evento, posicao, linhaDeDados, ownerId);
  await enviarNotificacao(ownerId, titulo, corpo, url, cliente);
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
  // a posição é o total de vendas: cada venda nova pega a frase seguinte da rotação e nenhuma se repete em seguida
  const { count } = await supabase.from("vendas").select("id", { count: "exact", head: true }).neq("status", "cancelada");
  const posicao = count ?? 0;
  await enviarEvento(user.id, pref, "venda", posicao, linhaDaVenda(venda, pref.dados.venda), url);

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
    await enviarEvento(user.id, pref, "meta", posicao, linhaDaMeta("vendas", faturamento), "/");
  }
  if (cruzou(lucroAntes, lucro, meta.meta_lucro)) {
    await enviarEvento(user.id, pref, "meta", posicao + 1, linhaDaMeta("lucro", lucro), "/");
  }

  // uma venda grande pode pular níveis: avisa só o mais alto
  const nivel = [...NIVEIS].reverse().find((n) => faturamentoAntes < n.valor && faturamento >= n.valor);
  if (nivel) {
    await enviarEvento(user.id, pref, nivel.evento, posicao, linhaDoNivel(faturamento, mes), "/");
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
      // dia após dia percorre as frases em ordem: nunca repete a de ontem
      const dia = Math.floor(Date.parse(`${hoje}T00:00:00Z`) / 86_400_000);
      await enviarEvento(ownerId, pref, "cobranca", dia, linhaDaCobranca(lista, pref.dados.cobranca), "/contas-a-receber", admin);
      enviados++;
    } catch {
      // um usuário com problema não pode impedir os demais
    }
  }
  return { usuarios: porDono.size, enviados };
}
