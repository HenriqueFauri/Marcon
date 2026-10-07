import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ehAdmin } from "@/lib/admin";
import { formatBRL, formatData } from "@/lib/format";
import { COMISSAO_MAXIMA, COMISSAO_PERCENTUAL, resumoDoAfiliado } from "@/lib/indicacao";
import { Badge, EmptyState, ErrorMessage, PageHeader, StatCard, Table, tbodyClass, tdClass, thClass, theadClass } from "@/components/ui";
import { AcoesSaque } from "./acoes-saque";
import { PercentualAfiliado } from "./percentual-afiliado";

export const metadata: Metadata = { title: "Indicações" };

interface Saque {
  id: string;
  afiliado_id: string;
  valor: number;
  chave_pix: string;
  status: "pedido" | "pago" | "recusado";
  pedido_em: string;
  resolvido_em: string | null;
}

export default async function IndicacoesAdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!ehAdmin(user)) notFound();

  const admin = createAdminClient();
  if (!admin) {
    return (
      <div className="mx-auto max-w-5xl">
        <PageHeader title="Indicações" back={{ href: "/admin", label: "Administração" }} />
        <ErrorMessage>Defina SUPABASE_SERVICE_ROLE_KEY no servidor para ver os saques.</ErrorMessage>
      </div>
    );
  }

  const [{ data: saquesData, error }, { data: comissoes }, { data: indicacoes }, { data: afiliadosData }] = await Promise.all([
    admin.from("saques").select("id, afiliado_id, valor, chave_pix, status, pedido_em, resolvido_em").order("pedido_em", { ascending: false }).limit(200),
    admin.from("comissoes").select("afiliado_id, valor, liberada_em, estornada_em"),
    admin.from("indicacoes").select("afiliado_id"),
    admin.from("afiliados").select("owner_id, codigo, percentual"),
  ]);

  if (error) {
    return (
      <div className="mx-auto max-w-5xl">
        <PageHeader title="Indicações" back={{ href: "/admin", label: "Administração" }} />
        <ErrorMessage>Não consegui ler os saques. Rode a migration 0023_indicacoes.sql.</ErrorMessage>
      </div>
    );
  }

  const saques = (saquesData ?? []) as Saque[];
  const pendentes = saques.filter((s) => s.status === "pedido").reverse(); // o mais antigo primeiro
  const resolvidos = saques.filter((s) => s.status !== "pedido").slice(0, 20);

  // total que o Marcon ainda deve aos afiliados, separado em "pode sacar já" e "ainda em carência"
  const resumo = resumoDoAfiliado(comissoes ?? [], saques);

  const indicados = indicacoes?.length ?? 0;

  // afiliados com indicados ou percentual negociado primeiro; os que só abriram a tela ficam no fim
  const indicadosPor = new Map<string, number>();
  for (const i of indicacoes ?? []) indicadosPor.set(i.afiliado_id, (indicadosPor.get(i.afiliado_id) ?? 0) + 1);
  const ganhoPor = new Map<string, number>();
  for (const c of comissoes ?? []) {
    if (!c.estornada_em) ganhoPor.set(c.afiliado_id, (ganhoPor.get(c.afiliado_id) ?? 0) + Number(c.valor));
  }
  const afiliados = [...(afiliadosData ?? [])]
    .sort(
      (a, b) =>
        (indicadosPor.get(b.owner_id) ?? 0) - (indicadosPor.get(a.owner_id) ?? 0) ||
        Number(b.percentual !== null) - Number(a.percentual !== null),
    )
    .slice(0, 50);

  // nome de cada afiliado nas listas
  const ids = [...new Set([...pendentes, ...resolvidos].map((s) => s.afiliado_id).concat(afiliados.map((a) => a.owner_id)))];
  const contas = await Promise.all(ids.map((id) => admin.auth.admin.getUserById(id)));
  const rotuloDe = new Map(
    ids.map((id, i) => {
      const u = contas[i].data.user;
      const nome = (u?.user_metadata?.nome as string | undefined) ?? (u?.user_metadata?.full_name as string | undefined) ?? "Sem nome";
      return [id, { nome, email: u?.email ?? "" }];
    }),
  );

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        back={{ href: "/admin", label: "Administração" }}
        title="Indicações"
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Saques para pagar"
          value={formatBRL(pendentes.reduce((s, p) => s + Number(p.valor), 0))}
          tone={pendentes.length > 0 ? "warning" : "neutral"}
          hint={`${pendentes.length} ${pendentes.length === 1 ? "pedido" : "pedidos"}`}
        />
        <StatCard label="Já pode sacar" value={formatBRL(resumo.disponivel)} hint="Saldo liberado, ainda não pedido" />
        <StatCard label="Em carência" value={formatBRL(resumo.aLiberar)} hint="Ainda não liberado" />
        <StatCard label="Indicados" value={indicados} hint={`${formatBRL(resumo.sacado)} já pagos`} />
      </div>

      <h2 className="mb-1 text-sm font-semibold text-ink">Afiliados e percentual</h2>
      <p className="mb-3 text-[13px] text-ink-muted">
        Vazio = padrão de {COMISSAO_PERCENTUAL}%. Máximo de {COMISSAO_MAXIMA}%. Vale para as próximas comissões; as que já foram geradas não mudam. O afiliado aparece aqui depois de abrir a tela Indique e ganhe uma vez.
      </p>
      {afiliados.length === 0 ? (
        <EmptyState title="Nenhum afiliado ainda" />
      ) : (
        <Table>
          <thead className={theadClass}>
            <tr>
              <th className={thClass}>Afiliado</th>
              <th className={thClass}>Código</th>
              <th className={`${thClass} text-right`}>Indicados</th>
              <th className={`${thClass} text-right`}>Ganho</th>
              <th className={`${thClass} text-right`}>Percentual</th>
            </tr>
          </thead>
          <tbody className={tbodyClass}>
            {afiliados.map((a) => (
              <tr key={a.owner_id}>
                <td className={tdClass}>
                  <p className="font-medium text-ink">{rotuloDe.get(a.owner_id)?.nome}</p>
                  <p className="text-[13px] text-ink-muted">{rotuloDe.get(a.owner_id)?.email}</p>
                </td>
                <td className={`${tdClass} font-mono text-[13px] text-ink-2`}>{a.codigo}</td>
                <td className={`${tdClass} text-right tabular-nums text-ink`}>{indicadosPor.get(a.owner_id) ?? 0}</td>
                <td className={`${tdClass} text-right tabular-nums text-ink`}>{formatBRL(ganhoPor.get(a.owner_id) ?? 0)}</td>
                <td className={tdClass}>
                  <PercentualAfiliado id={a.owner_id} atual={a.percentual === null ? null : Number(a.percentual)} />
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <h2 className="mb-3 mt-8 text-sm font-semibold text-ink">Para pagar</h2>
      {pendentes.length === 0 ? (
        <EmptyState title="Nenhum saque pendente" />
      ) : (
        <Table>
          <thead className={theadClass}>
            <tr>
              <th className={thClass}>Afiliado</th>
              <th className={thClass}>Chave PIX</th>
              <th className={`${thClass} text-right`}>Valor</th>
              <th className={thClass}>
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody className={tbodyClass}>
            {pendentes.map((s) => (
              <tr key={s.id}>
                <td className={tdClass}>
                  <p className="font-medium text-ink">{rotuloDe.get(s.afiliado_id)?.nome}</p>
                  <p className="text-[13px] text-ink-muted">
                    {rotuloDe.get(s.afiliado_id)?.email} · pediu em {formatData(s.pedido_em.slice(0, 10))}
                  </p>
                </td>
                <td className={`${tdClass} font-mono text-[13px] text-ink-2`}>{s.chave_pix}</td>
                <td className={`${tdClass} text-right font-semibold tabular-nums text-ink`}>{formatBRL(Number(s.valor))}</td>
                <td className={`${tdClass} text-right`}>
                  <AcoesSaque id={s.id} valor={Number(s.valor)} chavePix={s.chave_pix} />
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      {resolvidos.length > 0 && (
        <>
          <h2 className="mb-3 mt-8 text-sm font-semibold text-ink">Últimos resolvidos</h2>
          <Table>
            <thead className={theadClass}>
              <tr>
                <th className={thClass}>Afiliado</th>
                <th className={thClass}>Situação</th>
                <th className={`${thClass} text-right`}>Valor</th>
              </tr>
            </thead>
            <tbody className={tbodyClass}>
              {resolvidos.map((s) => (
                <tr key={s.id}>
                  <td className={tdClass}>
                    <p className="font-medium text-ink">{rotuloDe.get(s.afiliado_id)?.nome}</p>
                    <p className="text-[13px] text-ink-muted">{s.resolvido_em ? formatData(s.resolvido_em.slice(0, 10)) : ""}</p>
                  </td>
                  <td className={tdClass}>
                    <Badge tone={s.status === "pago" ? "positive" : "negative"}>{s.status === "pago" ? "Pago" : "Recusado"}</Badge>
                  </td>
                  <td className={`${tdClass} text-right tabular-nums text-ink`}>{formatBRL(Number(s.valor))}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </>
      )}
    </div>
  );
}
