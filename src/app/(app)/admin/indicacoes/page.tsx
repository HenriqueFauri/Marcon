import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { adminConfirmado } from "@/lib/admin";
import { formatBRL, formatData } from "@/lib/format";
import { COMISSAO_MAXIMA, COMISSAO_PERCENTUAL, resumoDoAfiliado } from "@/lib/indicacao";
import { Badge, ErrorMessage, PageHeader, StatCard, tbodyClass, tdClass, thClass, theadClass } from "@/components/ui";
import { Grupo } from "@/components/ajustes";
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

const voltar = { href: "/admin", label: "Administração" };
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

// linha vazia dentro de um Grupo sem padding
function Vazio({ children }: { children: string }) {
  return <p className="px-4 py-3 text-[15px] text-ink-muted">{children}</p>;
}

export default async function IndicacoesAdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!(await adminConfirmado(user))) notFound();

  const admin = createAdminClient();
  if (!admin) {
    return (
      <div className="mx-auto max-w-5xl">
        <PageHeader title="Indicações" back={voltar} />
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
        <PageHeader title="Indicações" back={voltar} />
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
      <PageHeader title="Indicações" back={voltar} />

      <div className="mb-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Saques para pagar"
          value={formatBRL(pendentes.reduce((s, p) => s + Number(p.valor), 0))}
          tone={pendentes.length > 0 ? "warning" : "neutral"}
          hint={plural(pendentes.length, "pedido", "pedidos")}
        />
        <StatCard label="Já pode sacar" value={formatBRL(resumo.disponivel)} hint="Saldo liberado, ainda não pedido" />
        <StatCard label="Em carência" value={formatBRL(resumo.aLiberar)} hint="Ainda não liberado" />
        <StatCard label="Indicados" value={indicados} hint={`${formatBRL(resumo.sacado)} já pagos`} />
      </div>

      <div className="flex flex-col gap-7">
        {/* primeiro o que pede ação: os saques para pagar */}
        <Grupo titulo="Para pagar" semPadding>
          {pendentes.length === 0 ? (
            <Vazio>Nenhum saque pendente.</Vazio>
          ) : (
            pendentes.map((s) => (
              <div key={s.id} className="flex flex-col gap-2 border-t border-line px-4 py-3 first:border-t-0 sm:flex-row sm:items-center sm:gap-4">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[17px] text-ink">{rotuloDe.get(s.afiliado_id)?.nome}</span>
                    <span className="block truncate text-[13px] text-ink-muted">
                      {rotuloDe.get(s.afiliado_id)?.email} · pediu em {formatData(s.pedido_em.slice(0, 10))}
                    </span>
                    <span className="block break-all font-mono text-[13px] text-ink-2">PIX {s.chave_pix}</span>
                  </span>
                  <span className="shrink-0 text-[17px] font-semibold tabular-nums text-ink">{formatBRL(Number(s.valor))}</span>
                </div>
                <AcoesSaque id={s.id} valor={Number(s.valor)} chavePix={s.chave_pix} />
              </div>
            ))
          )}
        </Grupo>

        <Grupo
          titulo="Afiliados e percentual"
          semPadding
          rodape={`Vazio é o padrão de ${COMISSAO_PERCENTUAL}%. Máximo de ${COMISSAO_MAXIMA}%. Vale para as próximas comissões; as que já foram geradas não mudam. O afiliado aparece aqui depois de abrir a tela Indique e ganhe uma vez.`}
        >
          {afiliados.length === 0 ? (
            <Vazio>Nenhum afiliado ainda.</Vazio>
          ) : (
            <>
              {/* celular: lista; o percentual fica na linha de baixo */}
              <ul className="divide-y divide-line sm:hidden">
                {afiliados.map((a) => (
                  <li key={a.owner_id} className="flex flex-col gap-2 px-4 py-3">
                    <div className="flex items-start gap-3">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[17px] text-ink">{rotuloDe.get(a.owner_id)?.nome}</span>
                        <span className="block truncate text-[13px] text-ink-muted">
                          {[a.codigo, plural(indicadosPor.get(a.owner_id) ?? 0, "indicado", "indicados")].join(" · ")}
                        </span>
                      </span>
                      <span className="shrink-0 text-[17px] tabular-nums text-ink">{formatBRL(ganhoPor.get(a.owner_id) ?? 0)}</span>
                    </div>
                    <PercentualAfiliado id={a.owner_id} atual={a.percentual === null ? null : Number(a.percentual)} />
                  </li>
                ))}
              </ul>

              {/* computador: tabela */}
              <div className="hidden overflow-x-auto sm:block">
                <table className="w-full text-sm">
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
                </table>
              </div>
            </>
          )}
        </Grupo>

        {resolvidos.length > 0 && (
          <Grupo titulo="Últimos resolvidos" semPadding>
            {resolvidos.map((s) => (
              <div key={s.id} className="flex items-center gap-3 border-t border-line px-4 py-3 first:border-t-0">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[17px] text-ink">{rotuloDe.get(s.afiliado_id)?.nome}</span>
                  {s.resolvido_em && <span className="block text-[13px] text-ink-muted">{formatData(s.resolvido_em.slice(0, 10))}</span>}
                </span>
                <Badge tone={s.status === "pago" ? "positive" : "negative"}>{s.status === "pago" ? "Pago" : "Recusado"}</Badge>
                <span className="shrink-0 text-[17px] tabular-nums text-ink">{formatBRL(Number(s.valor))}</span>
              </div>
            ))}
          </Grupo>
        )}
      </div>
    </div>
  );
}
