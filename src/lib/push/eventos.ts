import type { SupabaseClient, User } from "@supabase/supabase-js";
import { hojeISO, mesAtual, somarDias } from "@/lib/format";
import { enviarNotificacao } from "@/lib/push/send";
import {
  NIVEIS,
  eventoAtivo,
  lerPreferencias,
  linhaDaCobranca,
  linhaDaMeta,
  linhaDaVenda,
  linhaDoEstoqueBaixo,
  linhaDoEstoqueZerado,
  linhaDoNivel,
  linhaDoPedido,
  linhaDoResumo,
  montarNotificacao,
  type DadosResumoNotificacao,
  type DadosVendaNotificacao,
  type Evento,
  type ItemDeEstoque,
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
  if (!eventoAtivo(pref, evento)) return null;
  const { titulo, corpo } = montarNotificacao(evento, posicao, linhaDeDados, ownerId);
  return enviarNotificacao(ownerId, titulo, corpo, url, cliente);
}

// O PostgREST devolve no máximo 1000 linhas por consulta: as rotinas diárias leem página a página.
const PAGINA = 1000;
async function lerTudo<T>(pagina: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const tudo: T[] = [];
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await pagina(de, de + PAGINA - 1);
    if (error) throw error;
    tudo.push(...(data ?? []));
    if (!data || data.length < PAGINA) return tudo;
  }
}

interface VendaRegistrada extends DadosVendaNotificacao {
  vendaId: string;
  data: string; // YYYY-MM-DD
}

// Depois de registrar uma venda: avisa a venda, o estoque que ela deixou no limite ou zerado e,
// se ela empurrou o mês por cima da meta ou de um nível de faturamento, avisa a conquista também.
// "cliente": cliente de serviço para quando não há usuário logado (webhook do WhatsApp). Com ele as
// consultas não têm o RLS, por isso todas filtram pelo dono (user.id) explicitamente.
export async function avisarVenda(supabase: SupabaseClient, user: User, venda: VendaRegistrada, cliente?: SupabaseClient) {
  const pref = lerPreferencias(user.user_metadata);
  const url = `/vendas/${venda.vendaId}`;
  // a posição é o total de vendas: cada venda nova pega a frase seguinte da rotação e nenhuma se repete em seguida
  const { count } = await supabase.from("vendas").select("id", { count: "exact", head: true }).eq("owner_id", user.id).neq("status", "cancelada");
  const posicao = count ?? 0;
  await enviarEvento(user.id, pref, "venda", posicao, linhaDaVenda(venda, pref.dados.venda), url, cliente);

  try {
    await avisarEstoque(supabase, user.id, pref, venda.vendaId, posicao, cliente);
  } catch (e) {
    // o aviso de estoque não pode impedir os de meta e de nível
    console.error("[push] aviso de estoque", e);
  }

  // só vendas do mês corrente contam para meta e níveis
  const mes = mesAtual();
  if (venda.data.slice(0, 7) !== mes) return;
  if (!eventoAtivo(pref, "meta") && !eventoAtivo(pref, "nivel_1k")) return;

  const { data: doMes } = await supabase
    .from("vendas")
    .select("valor_total, custo_total")
    .eq("owner_id", user.id)
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
    await enviarEvento(user.id, pref, "meta", posicao, linhaDaMeta("vendas", faturamento), "/", cliente);
  }
  if (cruzou(lucroAntes, lucro, meta.meta_lucro)) {
    await enviarEvento(user.id, pref, "meta", posicao + 1, linhaDaMeta("lucro", lucro), "/", cliente);
  }

  // uma venda grande pode pular níveis: avisa só o mais alto
  const nivel = [...NIVEIS].reverse().find((n) => faturamentoAntes < n.valor && faturamento >= n.valor);
  if (nivel) {
    await enviarEvento(user.id, pref, nivel.evento, posicao, linhaDoNivel(faturamento, mes), "/", cliente);
  }
}

// Estoque acabando e zerado. Sai uma vez só, sem guardar estado: compara o estoque de antes desta
// venda (o de agora mais o que ela tirou) com o de depois, e só avisa se foi ESTA venda que cruzou
// o limite ("avisar quando tiver até") ou zerou. As vendas seguintes já partem de baixo do limite e
// não avisam de novo; se o estoque for reposto acima do limite, o próximo cruzamento volta a avisar.
// Produto com variações: o limite vale para a soma das variações; variação que zera avisa sozinha.
async function avisarEstoque(
  supabase: SupabaseClient,
  ownerId: string,
  pref: Preferencias,
  vendaId: string,
  posicao: number,
  cliente?: SupabaseClient,
) {
  if (!eventoAtivo(pref, "estoque_baixo")) return;

  const { data: itens } = await supabase
    .from("venda_itens")
    .select("produto_id, variacao_id, quantidade")
    .eq("venda_id", vendaId)
    .eq("owner_id", ownerId);
  const vendidoPorProduto = new Map<string, number>();
  const vendidoPorVariacao = new Map<string, number>();
  for (const i of itens ?? []) {
    if (!i.produto_id) continue;
    vendidoPorProduto.set(i.produto_id, (vendidoPorProduto.get(i.produto_id) ?? 0) + Number(i.quantidade));
    if (i.variacao_id) vendidoPorVariacao.set(i.variacao_id, (vendidoPorVariacao.get(i.variacao_id) ?? 0) + Number(i.quantidade));
  }
  const ids = [...vendidoPorProduto.keys()];
  if (ids.length === 0) return;

  const [{ data: produtos }, { data: variacoes }] = await Promise.all([
    supabase.from("produtos").select("id, nome, tem_variacoes, estoque_atual, alerta_estoque_baixo").eq("owner_id", ownerId).in("id", ids),
    supabase.from("produto_variacoes").select("id, produto_id, nome_combinacao, estoque").eq("owner_id", ownerId).in("produto_id", ids),
  ]);

  type Item = ItemDeEstoque & { produtoId: string };
  const baixos: Item[] = [];
  const zerados: Item[] = [];
  for (const p of produtos ?? []) {
    const vendido = vendidoPorProduto.get(p.id) ?? 0;
    const doProduto = (variacoes ?? []).filter((v) => v.produto_id === p.id);
    const depois = p.tem_variacoes ? doProduto.reduce((s, v) => s + Number(v.estoque), 0) : Number(p.estoque_atual);
    const antes = depois + vendido;
    const limite = p.alerta_estoque_baixo == null ? null : Number(p.alerta_estoque_baixo);

    if (antes > 0 && depois <= 0) {
      zerados.push({ produtoId: p.id, nome: p.nome, restam: 0 });
      continue;
    }
    if (p.tem_variacoes) {
      for (const v of doProduto) {
        const saiu = vendidoPorVariacao.get(v.id) ?? 0;
        if (saiu > 0 && Number(v.estoque) <= 0 && Number(v.estoque) + saiu > 0) {
          zerados.push({ produtoId: p.id, nome: `${p.nome} (${v.nome_combinacao})`, restam: 0 });
        }
      }
    }
    if (limite != null && antes > limite && depois <= limite) {
      baixos.push({ produtoId: p.id, nome: p.nome, restam: depois });
    }
  }

  // um produto só: abre o produto; mais de um: a lista já filtrada
  const destino = (lista: Item[], filtro: string) =>
    new Set(lista.map((i) => i.produtoId)).size === 1 ? `/produtos/${lista[0].produtoId}` : `/produtos?filtro=${filtro}`;

  if (zerados.length > 0) {
    await enviarEvento(ownerId, pref, "estoque_zerado", posicao, linhaDoEstoqueZerado(zerados), destino(zerados, "sem"), cliente);
  }
  if (baixos.length > 0) {
    await enviarEvento(ownerId, pref, "estoque_baixo", posicao, linhaDoEstoqueBaixo(baixos), destino(baixos, "baixo"), cliente);
  }
}

// Pedido novo da vitrine. A loja pública roda sem login e a função do banco não devolve o pedido,
// então ele é achado aqui pela loja e pelo código, entre os gravados agora há pouco. Se a função
// recusou o pedido (loja fora do ar, itens sem estoque), não há linha e não sai aviso.
export async function avisarPedidoDaVitrine(admin: SupabaseClient, slug: string, codigo: string) {
  const { data: vitrine } = await admin.from("vitrines").select("owner_id").eq("slug", slug).maybeSingle();
  if (!vitrine?.owner_id) return;
  const ownerId = vitrine.owner_id as string;

  const { data: pedido } = await admin
    .from("vitrine_pedidos")
    .select("id, total, cliente_nome, itens")
    .eq("owner_id", ownerId)
    .eq("codigo", codigo)
    .gte("created_at", new Date(Date.now() - 2 * 60_000).toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!pedido) return;

  const { data } = await admin.auth.admin.getUserById(ownerId);
  const pref = lerPreferencias(data.user?.user_metadata);
  if (!eventoAtivo(pref, "pedido")) return;

  // a posição é o total de pedidos da loja: cada pedido novo pega a frase seguinte
  const { count } = await admin.from("vitrine_pedidos").select("id", { count: "exact", head: true }).eq("owner_id", ownerId);
  const itens = (Array.isArray(pedido.itens) ? pedido.itens : []) as { nome?: string; variacao?: string | null; quantidade?: number }[];
  const linha = linhaDoPedido({
    total: Number(pedido.total),
    cliente: pedido.cliente_nome,
    itens: itens.map((i) => ({ nome: i.variacao ? `${i.nome} (${i.variacao})` : String(i.nome ?? ""), quantidade: Number(i.quantidade ?? 1) })),
  });
  await enviarEvento(ownerId, pref, "pedido", count ?? 0, linha, `/vitrine/pedidos/${pedido.id}`, admin);
}

function primeiroDiaDoProximoMes(mes: string) {
  const [ano, m] = mes.split("-").map(Number);
  return m === 12 ? `${ano + 1}-01-01` : `${ano}-${String(m + 1).padStart(2, "0")}-01`;
}

function diasEntre(deISO: string, ateISO: string) {
  return Math.round((Date.parse(`${ateISO}T00:00:00Z`) - Date.parse(`${deISO}T00:00:00Z`)) / 86_400_000);
}

// as rotinas diárias percorrem as frases dia após dia: nunca repetem a de ontem
function numeroDoDia(iso: string) {
  return Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);
}

// Rotina diária: um resumo por usuário com as parcelas que vencem hoje ou já
// venceram. Roda sem sessão, por isso usa o cliente de serviço.
export async function enviarCobrancasDoDia(admin: SupabaseClient) {
  const hoje = hojeISO();
  const parcelas = await lerTudo((de, ate) =>
    admin
      .from("parcelas")
      .select("owner_id, valor, vencimento, vendas(cliente_nome)")
      .neq("status", "pago")
      .lte("vencimento", hoje)
      .order("id")
      .range(de, ate),
  );

  const porDono = new Map<string, ParcelaParaCobrar[]>();
  for (const p of parcelas) {
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
      await enviarEvento(ownerId, pref, "cobranca", numeroDoDia(hoje), linhaDaCobranca(lista, pref.dados.cobranca), "/contas-a-receber", admin);
      enviados++;
    } catch (e) {
      // um usuário com problema não pode impedir os demais
      console.error("[push] lembrete de cobrança", { ownerId, erro: e instanceof Error ? e.message : String(e) });
    }
  }
  return { usuarios: porDono.size, enviados };
}

// Rotina diária das 20h (Brasília): o resumo do dia de quem vendeu hoje, com vendas, valor, lucro
// e as parcelas que vencem amanhã. Sem venda no dia não sai aviso.
export async function enviarResumosDoDia(admin: SupabaseClient) {
  const hoje = hojeISO();
  const amanha = somarDias(hoje, 1);

  const vendas = await lerTudo((de, ate) =>
    admin
      .from("vendas")
      .select("owner_id, valor_total, custo_total")
      .eq("data", hoje)
      .neq("status", "cancelada")
      .order("id")
      .range(de, ate),
  );
  const porDono = new Map<string, DadosResumoNotificacao>();
  for (const v of vendas) {
    const r = porDono.get(v.owner_id) ?? { vendas: 0, valor: 0, lucro: 0, parcelasAmanha: 0, valorParcelasAmanha: 0 };
    r.vendas++;
    r.valor += Number(v.valor_total);
    r.lucro += Number(v.valor_total) - Number(v.custo_total);
    porDono.set(v.owner_id, r);
  }
  if (porDono.size === 0) return { usuarios: 0, enviados: 0 };

  const parcelas = await lerTudo((de, ate) =>
    admin.from("parcelas").select("owner_id, valor").neq("status", "pago").eq("vencimento", amanha).order("id").range(de, ate),
  );
  for (const p of parcelas) {
    const r = porDono.get(p.owner_id);
    if (!r) continue;
    r.parcelasAmanha++;
    r.valorParcelasAmanha += Number(p.valor);
  }

  let enviados = 0;
  for (const [ownerId, resumo] of porDono) {
    try {
      const { data } = await admin.auth.admin.getUserById(ownerId);
      const pref = lerPreferencias(data.user?.user_metadata);
      if (!eventoAtivo(pref, "resumo")) continue;
      await enviarEvento(ownerId, pref, "resumo", numeroDoDia(hoje), linhaDoResumo(resumo, pref.dados), "/", admin);
      enviados++;
    } catch (e) {
      console.error("[push] resumo do dia", { ownerId, erro: e instanceof Error ? e.message : String(e) });
    }
  }
  return { usuarios: porDono.size, enviados };
}
