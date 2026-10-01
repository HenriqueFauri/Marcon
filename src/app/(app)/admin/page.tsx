import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ehAdmin } from "@/lib/admin";
import { rotuloDaSituacao, situacaoDaAssinatura } from "@/lib/assinatura";
import { formatBRL, formatData, formatDataCurta } from "@/lib/format";
import { PLANOS } from "@/lib/planos";
import { Badge, EmptyState, ErrorMessage, PageHeader, StatCard, Table, tbodyClass, tdClass, thClass, theadClass } from "@/components/ui";
import { SearchInput } from "@/components/search-input";
import { AcoesConta } from "./acoes-conta";

export const metadata: Metadata = { title: "Administração" };

interface Uso {
  owner_id: string;
  produtos: number;
  vendas_mes: number;
  ultima_venda: string | null;
}

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

function bloqueada(u: User) {
  return !!u.banned_until && new Date(u.banned_until).getTime() > Date.now();
}

function criadaNaUltimaSemana(u: User) {
  return new Date(u.created_at).getTime() > Date.now() - 7 * 24 * 60 * 60 * 1000;
}

export default async function AdminPage({ searchParams }: PageProps<"/admin">) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // para quem não é admin a tela nem existe
  if (!ehAdmin(user)) notFound();

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

  const [contas, { data: assinaturas }, { data: usos, error: erroUso }] = await Promise.all([
    todasAsContas(admin),
    admin.from("assinaturas").select("owner_id, plano, status, proximo_vencimento"),
    admin.rpc("admin_uso_por_conta"),
  ]);
  const assinaturaPorConta = new Map((assinaturas ?? []).map((a) => [a.owner_id as string, a]));
  const usoPorConta = new Map(((usos ?? []) as Uso[]).map((u) => [u.owner_id, u]));

  const linhas = contas
    .map((u) => {
      const situacao = situacaoDaAssinatura(assinaturaPorConta.get(u.id) ?? null, u.created_at);
      return {
        u,
        situacao,
        rotulo: rotuloDaSituacao(situacao),
        uso: usoPorConta.get(u.id),
        negocio: (u.user_metadata?.nome_negocio as string | undefined) || null,
        nome: (u.user_metadata?.nome as string | undefined) ?? (u.user_metadata?.full_name as string | undefined) ?? null,
        eAdmin: ehAdmin(u),
      };
    })
    .sort((a, b) => b.u.created_at.localeCompare(a.u.created_at));

  const filtradas = busca
    ? linhas.filter((l) => [l.u.email, l.negocio, l.nome].some((t) => t?.toLowerCase().includes(busca)))
    : linhas;

  const pagantes = linhas.filter((l) => l.situacao.tipo === "ativa" || l.situacao.tipo === "atrasada").length;
  const receitaMensal = pagantes * PLANOS.marcon.valor;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Administração"
        description="Todas as contas do Marcon. Sua conta e seus dados continuam os mesmos: esta tela é só uma a mais."
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Contas"
          value={linhas.length}
          hint={`${linhas.filter((l) => criadaNaUltimaSemana(l.u)).length} nos últimos 7 dias`}
        />
        <StatCard label="Em teste" value={linhas.filter((l) => l.situacao.tipo === "teste").length} />
        <StatCard
          label="Pagantes"
          value={pagantes}
          tone="positive"
          hint={`${formatBRL(receitaMensal)} por mês`}
        />
        <StatCard
          label="Cortesia"
          value={linhas.filter((l) => l.situacao.tipo === "cortesia").length}
          hint={`${linhas.filter((l) => l.situacao.tipo === "gratis").length} no grátis`}
        />
      </div>

      {erroUso && (
        <div className="mb-4">
          <ErrorMessage>Não consegui ler o uso das contas. Rode a migration 0013_admin.sql.</ErrorMessage>
        </div>
      )}

      <div className="mb-4 max-w-sm">
        <SearchInput placeholder="Buscar por e-mail ou negócio" />
      </div>

      {filtradas.length === 0 ? (
        <EmptyState title="Nenhuma conta encontrada" />
      ) : (
        <Table>
          <thead className={theadClass}>
            <tr>
              <th className={thClass}>Conta</th>
              <th className={thClass}>Plano</th>
              <th className={`${thClass} text-right`}>Produtos</th>
              <th className={`${thClass} text-right`}>Vendas no mês</th>
              <th className={thClass}>Último acesso</th>
              <th className={thClass}>
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody className={tbodyClass}>
            {filtradas.map(({ u, situacao, rotulo, uso, negocio, nome, eAdmin }) => (
              <tr key={u.id} className={bloqueada(u) ? "opacity-60" : ""}>
                <td className={tdClass}>
                  <p className="flex flex-wrap items-center gap-2 font-medium text-ink">
                    {negocio ?? nome ?? "Sem nome"}
                    {eAdmin && <Badge tone="info">Admin</Badge>}
                    {u.id === user!.id && <Badge>Você</Badge>}
                    {bloqueada(u) && <Badge tone="negative">Bloqueada</Badge>}
                    {!u.email_confirmed_at && <Badge tone="warning">E-mail não confirmado</Badge>}
                  </p>
                  <p className="text-[13px] text-ink-muted">
                    {u.email} · desde {formatData(u.created_at.slice(0, 10))}
                  </p>
                </td>
                <td className={tdClass}>
                  <Badge tone={rotulo.tom}>{situacao.tipo === "cortesia" ? "Cortesia" : rotulo.texto}</Badge>
                </td>
                <td className={`${tdClass} text-right tabular-nums`}>{uso?.produtos ?? "—"}</td>
                <td className={`${tdClass} text-right tabular-nums`}>
                  {uso?.vendas_mes ?? "—"}
                  {uso?.ultima_venda && (
                    <span className="block text-[12px] text-ink-muted">última {formatDataCurta(uso.ultima_venda)}</span>
                  )}
                </td>
                <td className={`${tdClass} whitespace-nowrap text-ink-2`}>
                  {u.last_sign_in_at ? formatDataCurta(u.last_sign_in_at.slice(0, 10)) : "Nunca"}
                </td>
                <td className={`${tdClass} text-right`}>
                  <AcoesConta
                    id={u.id}
                    email={u.email ?? ""}
                    bloqueada={bloqueada(u)}
                    cortesia={situacao.tipo === "cortesia"}
                    pagante={situacao.tipo === "ativa" || situacao.tipo === "atrasada"}
                    podeBloquear={!eAdmin}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
