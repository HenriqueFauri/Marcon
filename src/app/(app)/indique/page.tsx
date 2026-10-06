import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Badge, Card, EmptyState, PageHeader, StatCard, Table, tbodyClass, tdClass, thClass, theadClass } from "@/components/ui";
import { formatBRL, formatData } from "@/lib/format";
import { PLANOS } from "@/lib/planos";
import { rotuloDaSituacao, situacaoDaAssinatura } from "@/lib/assinatura";
import {
  CARENCIA_DIAS,
  COMISSAO_PERCENTUAL,
  COMISSAO_POR_MES,
  SAQUE_MINIMO,
  linkDeIndicacao,
  mensagemDeConvite,
  resumoDoAfiliado,
} from "@/lib/indicacao";
import { enderecoDoApp, garantirAfiliado } from "@/lib/indicacao-servidor";
import { CompartilharCard, SaqueCard } from "./indique-cliente";

export const metadata: Metadata = { title: "Indique e ganhe" };

interface Comissao {
  id: string;
  indicado_id: string;
  valor: number;
  liberada_em: string;
  estornada_em: string | null;
  created_at: string;
}

interface Saque {
  id: string;
  valor: number;
  chave_pix: string;
  status: "pedido" | "pago" | "recusado";
  pedido_em: string;
  resolvido_em: string | null;
}

interface Indicado {
  id: string;
  nome: string;
  negocio: string | null;
  desde: string;
  situacao: { texto: string; tom: "neutral" | "positive" | "warning" | "info" } | null;
}

function primeiroNome(meta: Record<string, unknown> | undefined) {
  const bruto = String(meta?.nome ?? meta?.full_name ?? meta?.name ?? "").trim();
  return bruto.split(/\s+/)[0] || "Alguém";
}

// nome e situação de quem a pessoa indicou; só lê as contas que o banco já mostrou a ela
async function carregarIndicados(ids: string[], desde: Map<string, string>): Promise<Indicado[]> {
  const admin = createAdminClient();
  if (!admin || ids.length === 0) {
    return ids.map((id) => ({ id, nome: "Alguém", negocio: null, desde: desde.get(id)!, situacao: null }));
  }
  const [contas, { data: assinaturas }] = await Promise.all([
    Promise.all(ids.map((id) => admin.auth.admin.getUserById(id))),
    admin.from("assinaturas").select("owner_id, plano, status, proximo_vencimento").in("owner_id", ids),
  ]);
  const assinaturaPorConta = new Map((assinaturas ?? []).map((a) => [a.owner_id as string, a]));

  return ids.map((id, i) => {
    const conta = contas[i].data.user;
    const linha = assinaturaPorConta.get(id) ?? null;
    return {
      id,
      nome: primeiroNome(conta?.user_metadata),
      negocio: (conta?.user_metadata?.nome_negocio as string | undefined) || null,
      desde: desde.get(id)!,
      situacao: conta ? rotuloDaSituacao(situacaoDaAssinatura(linha, conta.created_at)) : null,
    };
  });
}

export default async function IndiquePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const afiliado = await garantirAfiliado(supabase, user.id);

  const [{ data: comissoesData }, { data: saquesData }, { data: indicacoesData }, base] = await Promise.all([
    supabase.from("comissoes").select("id, indicado_id, valor, liberada_em, estornada_em, created_at").order("created_at", { ascending: false }),
    supabase.from("saques").select("id, valor, chave_pix, status, pedido_em, resolvido_em").order("pedido_em", { ascending: false }),
    supabase.from("indicacoes").select("indicado_id, created_at").order("created_at", { ascending: false }),
    enderecoDoApp(),
  ]);
  const comissoes = (comissoesData ?? []) as Comissao[];
  const saques = (saquesData ?? []) as Saque[];
  const indicacoes = (indicacoesData ?? []) as { indicado_id: string; created_at: string }[];

  const resumo = resumoDoAfiliado(comissoes, saques);
  const link = linkDeIndicacao(base, afiliado.codigo);
  const indicados = await carregarIndicados(
    indicacoes.map((i) => i.indicado_id),
    new Map(indicacoes.map((i) => [i.indicado_id, i.created_at.slice(0, 10)])),
  );
  const nomeDe = new Map(indicados.map((i) => [i.id, i.nome]));

  const ganhoPorIndicado = new Map<string, number>();
  for (const c of comissoes) {
    if (c.estornada_em) continue;
    ganhoPorIndicado.set(c.indicado_id, (ganhoPorIndicado.get(c.indicado_id) ?? 0) + Number(c.valor));
  }

  const extrato = [
    ...comissoes.map((c) => ({ tipo: "comissao" as const, data: c.created_at, c })),
    ...saques.map((s) => ({ tipo: "saque" as const, data: s.pedido_em, s })),
  ].sort((a, b) => b.data.localeCompare(a.data));

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Indique e ganhe"
        description={`Cada pessoa que você indicar e assinar paga ${formatBRL(PLANOS.marcon.valor)} por mês. Você fica com ${COMISSAO_PERCENTUAL}% (${formatBRL(COMISSAO_POR_MES)}) de cada mensalidade, todo mês, enquanto ela continuar assinando.`}
      />

      <div className="flex flex-col gap-6">
        <CompartilharCard link={link} mensagem={mensagemDeConvite(link)} />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatCard
            label="Disponível para sacar"
            value={formatBRL(resumo.disponivel)}
            tone={resumo.disponivel > 0 ? "positive" : "neutral"}
            hint={resumo.emPedido > 0 ? `${formatBRL(resumo.emPedido)} em saque` : undefined}
          />
          <StatCard label="A liberar" value={formatBRL(resumo.aLiberar)} hint={`Libera ${CARENCIA_DIAS} dias após cada pagamento`} />
          <StatCard label="Já recebido" value={formatBRL(resumo.sacado)} hint={`${formatBRL(resumo.totalGanho)} ganhos no total`} />
        </div>

        <SaqueCard disponivel={resumo.disponivel} chavePix={afiliado.chave_pix} emPedido={resumo.emPedido} />

        <section>
          <h2 className="mb-3 text-sm font-semibold text-ink">Quem você indicou</h2>
          {indicados.length === 0 ? (
            <EmptyState
              title="Ninguém ainda"
              description="Mande o link para quem vende pelo celular e ainda anota tudo no caderno. Quando a pessoa criar a conta, ela aparece aqui."
            />
          ) : (
            <Table compacta>
              <thead className={theadClass}>
                <tr>
                  <th className={thClass}>Pessoa</th>
                  <th className={thClass}>Situação</th>
                  <th className={`${thClass} text-right`}>Você ganhou</th>
                </tr>
              </thead>
              <tbody className={tbodyClass}>
                {indicados.map((i) => (
                  <tr key={i.id}>
                    <td className={tdClass}>
                      <p className="font-medium text-ink">{i.nome}</p>
                      <p className="text-[13px] text-ink-muted">
                        {i.negocio ? `${i.negocio} · ` : ""}entrou em {formatData(i.desde)}
                      </p>
                    </td>
                    <td className={tdClass}>{i.situacao && <Badge tone={i.situacao.tom}>{i.situacao.texto}</Badge>}</td>
                    <td className={`${tdClass} text-right tabular-nums text-ink`}>{formatBRL(ganhoPorIndicado.get(i.id) ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </section>

        {extrato.length > 0 && (
          <section>
            <h2 className="mb-3 text-sm font-semibold text-ink">Extrato</h2>
            <Table compacta>
              <thead className={theadClass}>
                <tr>
                  <th className={thClass}>O que foi</th>
                  <th className={thClass}>Situação</th>
                  <th className={`${thClass} text-right`}>Valor</th>
                </tr>
              </thead>
              <tbody className={tbodyClass}>
                {extrato.map((linha) =>
                  linha.tipo === "comissao" ? (
                    <tr key={linha.c.id}>
                      <td className={tdClass}>
                        <p className="font-medium text-ink">Mensalidade de {nomeDe.get(linha.c.indicado_id) ?? "alguém"}</p>
                        <p className="text-[13px] text-ink-muted">{formatData(linha.data.slice(0, 10))}</p>
                      </td>
                      <td className={tdClass}>
                        {linha.c.estornada_em ? (
                          <Badge tone="negative">Estornada</Badge>
                        ) : new Date(linha.c.liberada_em) > new Date() ? (
                          <Badge tone="info">Libera em {formatData(linha.c.liberada_em.slice(0, 10))}</Badge>
                        ) : (
                          <Badge tone="positive">Liberada</Badge>
                        )}
                      </td>
                      <td className={`${tdClass} text-right tabular-nums ${linha.c.estornada_em ? "text-ink-muted line-through" : "text-ink"}`}>
                        {formatBRL(Number(linha.c.valor))}
                      </td>
                    </tr>
                  ) : (
                    <tr key={linha.s.id}>
                      <td className={tdClass}>
                        <p className="font-medium text-ink">Saque por PIX</p>
                        <p className="text-[13px] text-ink-muted">
                          {formatData(linha.data.slice(0, 10))} · {linha.s.chave_pix}
                        </p>
                      </td>
                      <td className={tdClass}>
                        <Badge tone={linha.s.status === "pago" ? "positive" : linha.s.status === "recusado" ? "negative" : "warning"}>
                          {linha.s.status === "pago" ? "Pago" : linha.s.status === "recusado" ? "Recusado" : "Aguardando pagamento"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3.5 text-right tabular-nums text-ink">− {formatBRL(Number(linha.s.valor))}</td>
                    </tr>
                  ),
                )}
              </tbody>
            </Table>
          </section>
        )}

        <Card title="As regras">
          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-[15px] text-ink-2">
            <li>
              Você ganha {COMISSAO_PERCENTUAL}% de cada mensalidade paga por quem indicou, inclusive nas renovações.
            </li>
            <li>
              O valor vira saldo {CARENCIA_DIAS} dias depois do pagamento, que é o prazo que o cartão leva para ficar sem risco de estorno.
            </li>
            <li>Saque a partir de {formatBRL(SAQUE_MINIMO)}, por PIX.</li>
            <li>Se o pagamento for estornado, a comissão dele é cancelada.</li>
            <li>Vale só para conta nova. Indicar a própria conta não conta.</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
