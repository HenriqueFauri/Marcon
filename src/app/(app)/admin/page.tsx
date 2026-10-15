import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { adminConfirmado, ehAdmin } from "@/lib/admin";
import { rotuloDaSituacao, situacaoDaAssinatura } from "@/lib/assinatura";
import { formatBRL, formatData, formatDataCurta } from "@/lib/format";
import { PLANOS } from "@/lib/planos";
import { rotuloDoMotivo } from "@/lib/cortesia";
import { Badge, EmptyState, ErrorMessage, PageHeader, Segmentos, StatCard, Table, tbodyClass, tdClass, thClass, theadClass } from "@/components/ui";
import { SearchInput } from "@/components/search-input";
import { bloqueada, contaGerenciavel, type ResumoConta } from "./dados";
import { AbasAdmin } from "./abas";
import { AcoesRapidas } from "./gerenciar-conta";

export const metadata: Metadata = { title: "Administração" };

// o Supabase devolve as contas em páginas; junta todas
async function todasAsContas(admin: NonNullable<ReturnType<typeof createAdminClient>>) {
  const contas: User[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    contas.push(...data.users);
    if (data.users.length < 1000) return contas;
  }
}

function criadaNaUltimaSemana(u: User) {
  return new Date(u.created_at).getTime() > Date.now() - 7 * 24 * 60 * 60 * 1000;
}

export default async function AdminPage({ searchParams }: PageProps<"/admin">) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // para quem não é admin (nos dois fatores) a tela nem existe
  if (!(await adminConfirmado(user))) notFound();

  const admin = createAdminClient();
  if (!admin) {
    return (
      <div className="mx-auto max-w-5xl">
        <PageHeader title="Administração" />
        <ErrorMessage>Defina SUPABASE_SERVICE_ROLE_KEY no servidor para ver as contas.</ErrorMessage>
      </div>
    );
  }

  const sp = await searchParams;
  const busca = (typeof sp.q === "string" ? sp.q : "").trim().toLowerCase();
  const grupo = ["pagantes", "cortesia", "teste"].includes(String(sp.situacao)) ? String(sp.situacao) : "todas";

  const [contas, { data: assinaturas }, { data: resumos, error: erroResumo }, { data: liberados }, { data: vinculos }] = await Promise.all([
    todasAsContas(admin),
    admin.from("assinaturas").select("owner_id, plano, status, proximo_vencimento, cortesia_ate, cortesia_em, cortesia_motivo"),
    admin.rpc("admin_resumo_por_conta"),
    admin.from("whatsapp_liberados").select("owner_id, lancar"),
    admin.from("whatsapp_vinculos").select("owner_id, telefone"),
  ]);
  // contas com o assistente no WhatsApp liberado no painel (o admin tem sempre)
  const liberadoPorConta = new Map((liberados ?? []).map((l) => [l.owner_id as string, l as { lancar: boolean | null }]));
  const telefonePorConta = new Map((vinculos ?? []).map((v) => [v.owner_id as string, v.telefone as string]));
  const assinaturaPorConta = new Map((assinaturas ?? []).map((a) => [a.owner_id as string, a]));
  const resumoPorConta = new Map(((resumos ?? []) as ResumoConta[]).map((r) => [r.owner_id, r]));

  const linhas = contas
    .map((u) => {
      const situacao = situacaoDaAssinatura(assinaturaPorConta.get(u.id) ?? null, u.created_at);
      const negocio = (u.user_metadata?.nome_negocio as string | undefined) || null;
      const nome = (u.user_metadata?.nome as string | undefined) ?? (u.user_metadata?.full_name as string | undefined) ?? null;
      const titulo = negocio ?? nome ?? u.email ?? "Sem nome";
      const eAdmin = ehAdmin(u);
      return {
        u,
        situacao,
        rotulo: rotuloDaSituacao(situacao),
        resumo: resumoPorConta.get(u.id),
        titulo,
        negocio,
        nome,
        eAdmin,
        assistente: liberadoPorConta.has(u.id),
        motivo: situacao.tipo === "cortesia" ? rotuloDoMotivo(assinaturaPorConta.get(u.id)?.cortesia_motivo) : null,
        // a lista marca o admin pelo primeiro fator; as ações no servidor conferem os dois
        gerenciavel: contaGerenciavel(u, {
          titulo,
          situacao,
          motivo: assinaturaPorConta.get(u.id)?.cortesia_motivo,
          admin: eAdmin,
          liberado: liberadoPorConta.get(u.id),
          telefone: telefonePorConta.get(u.id),
        }),
      };
    })
    .sort((a, b) => b.u.created_at.localeCompare(a.u.created_at));

  // pagantes = assinatura ativa ou atrasada; cortesia = plano dado pelo admin; teste = os 14 dias.
  // Quem está no grátis aparece em "Todas" e na busca (4 filtros é o que cabe no celular).
  const doGrupo = (tipo: string) => (tipo === "ativa" || tipo === "atrasada" ? "pagantes" : tipo === "cortesia" ? "cortesia" : tipo === "teste" ? "teste" : "outras");
  const filtradas = linhas
    .filter((l) => grupo === "todas" || doGrupo(l.situacao.tipo) === grupo)
    .filter((l) => !busca || [l.u.email, l.negocio, l.nome].some((t) => t?.toLowerCase().includes(busca)));
  const hrefDoFiltro = (g: string) => {
    const p = new URLSearchParams();
    if (g !== "todas") p.set("situacao", g);
    if (busca) p.set("q", busca);
    const qs = p.toString();
    return qs ? `/admin?${qs}` : "/admin";
  };

  const pagantes = linhas.filter((l) => l.situacao.tipo === "ativa" || l.situacao.tipo === "atrasada").length;
  const receitaMensal = pagantes * PLANOS.marcon.valor;
  const vendidoNoMes = linhas.reduce((s, l) => s + Number(l.resumo?.valor_mes ?? 0), 0);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Administração" />
      <AbasAdmin ativa="contas" />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Contas" value={linhas.length} hint={`${linhas.filter((l) => criadaNaUltimaSemana(l.u)).length} nos últimos 7 dias`} />
        <StatCard label="Pagantes" value={pagantes} tone="positive" hint={`${formatBRL(receitaMensal)} por mês`} />
        <StatCard
          label="Em teste"
          value={linhas.filter((l) => l.situacao.tipo === "teste").length}
          hint={`${linhas.filter((l) => l.situacao.tipo === "cortesia").length} cortesia, ${linhas.filter((l) => l.situacao.tipo === "gratis").length} no grátis`}
        />
        <StatCard label="Vendido pelas contas" value={formatBRL(vendidoNoMes)} hint="neste mês, todas somadas" />
      </div>

      {erroResumo && (
        <div className="mb-4">
          <ErrorMessage>Não consegui ler os números das contas. Rode a migration 0048_admin_seguro.sql.</ErrorMessage>
        </div>
      )}

      <Segmentos
        rotulo="Filtrar contas"
        className="mb-3"
        itens={[
          { href: hrefDoFiltro("todas"), label: "Todas", ativo: grupo === "todas" },
          { href: hrefDoFiltro("pagantes"), label: "Pagantes", ativo: grupo === "pagantes" },
          { href: hrefDoFiltro("cortesia"), label: "Cortesia", ativo: grupo === "cortesia" },
          { href: hrefDoFiltro("teste"), label: "Teste", ativo: grupo === "teste" },
        ]}
      />
      <div className="mb-4 sm:max-w-sm">
        <SearchInput placeholder="Buscar por e-mail ou negócio" />
      </div>

      {filtradas.length === 0 ? (
        <EmptyState title="Nenhuma conta encontrada" />
      ) : (
        <>
          {/* celular: lista agrupada, cada conta abre o detalhe */}
          <ul className="hairline divide-y divide-line overflow-hidden rounded-3xl bg-surface sm:hidden">
            {filtradas.map(({ u, rotulo, resumo, titulo, assistente, gerenciavel }) => (
              <li key={u.id} className="flex items-center pr-2">
                <Link
                  href={`/admin/contas/${u.id}`}
                  className={`flex min-w-0 flex-1 items-center gap-3 py-3 pl-4 transition active:bg-fill ${bloqueada(u) ? "opacity-60" : ""}`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[17px] text-ink">
                      {titulo}
                      {u.id === user!.id && <span className="text-ink-muted"> (você)</span>}
                    </span>
                    <span className="block truncate text-[13px] text-ink-muted">
                      {[bloqueada(u) ? "Bloqueada" : rotulo.texto, `${resumo?.vendas_mes ?? 0} vendas no mês`, assistente ? "Assistente" : null].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-[17px] tabular-nums text-ink">{formatBRL(Number(resumo?.valor_mes ?? 0))}</span>
                    <span className="block text-[13px] tabular-nums text-ink-muted">no mês</span>
                  </span>
                </Link>
                <AcoesRapidas conta={gerenciavel} />
              </li>
            ))}
          </ul>

          {/* computador: tabela */}
          <div className="hidden sm:block">
            <Table>
              <thead className={theadClass}>
                <tr>
                  <th className={thClass}>Conta</th>
                  <th className={thClass}>Plano</th>
                  <th className={`${thClass} text-right`}>Produtos</th>
                  <th className={`${thClass} whitespace-nowrap text-right`}>No mês</th>
                  <th className={`${thClass} whitespace-nowrap text-right`}>Lucro</th>
                  <th className={`${thClass} whitespace-nowrap text-right`}>Total</th>
                  <th className={`${thClass} whitespace-nowrap`}>Acesso</th>
                  <th className={`${thClass} w-12`}>
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody className={tbodyClass}>
                {filtradas.map(({ u, rotulo, resumo, titulo, eAdmin, assistente, motivo, gerenciavel }) => (
                  <tr key={u.id} className={bloqueada(u) ? "opacity-60" : ""}>
                    <td className={tdClass}>
                      <Link href={`/admin/contas/${u.id}`} className="flex flex-wrap items-center gap-2 font-medium text-ink hover:underline">
                        {titulo}
                        {eAdmin && <Badge tone="info">Admin</Badge>}
                        {assistente && <Badge>Assistente</Badge>}
                        {u.id === user!.id && <Badge>Você</Badge>}
                        {bloqueada(u) && <Badge tone="negative">Bloqueada</Badge>}
                        {!u.email_confirmed_at && <Badge tone="warning">E-mail não confirmado</Badge>}
                      </Link>
                      <p className="text-[13px] text-ink-muted">
                        {u.email} · desde {formatData(u.created_at.slice(0, 10))}
                      </p>
                    </td>
                    <td className={tdClass}>
                      <Badge tone={rotulo.tom}>{rotulo.texto}</Badge>
                      {motivo && <span className="mt-0.5 block text-[12px] text-ink-muted">{motivo}</span>}
                    </td>
                    <td className={`${tdClass} text-right tabular-nums`}>{resumo?.produtos ?? 0}</td>
                    <td className={`${tdClass} text-right tabular-nums`}>
                      {formatBRL(Number(resumo?.valor_mes ?? 0))}
                      <span className="block text-[12px] text-ink-muted">
                        {resumo?.vendas_mes ?? 0} vendas{resumo?.ultima_venda ? `, última ${formatDataCurta(resumo.ultima_venda)}` : ""}
                      </span>
                    </td>
                    <td className={`${tdClass} text-right tabular-nums ${Number(resumo?.lucro_mes ?? 0) < 0 ? "text-danger" : "text-positive"}`}>
                      {formatBRL(Number(resumo?.lucro_mes ?? 0))}
                    </td>
                    <td className={`${tdClass} text-right tabular-nums`}>{formatBRL(Number(resumo?.valor_total ?? 0))}</td>
                    <td className={`${tdClass} whitespace-nowrap text-ink-2`}>
                      {u.last_sign_in_at ? formatDataCurta(u.last_sign_in_at.slice(0, 10)) : "Nunca"}
                    </td>
                    <td className={`${tdClass} py-1 pr-2`}>
                      <AcoesRapidas conta={gerenciavel} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
