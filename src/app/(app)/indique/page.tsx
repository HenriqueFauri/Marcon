import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Badge, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { Grupo } from "@/components/ajustes";
import { formatBRL, formatData } from "@/lib/format";
import { PLANOS } from "@/lib/planos";
import { rotuloDaSituacao, situacaoDaAssinatura } from "@/lib/assinatura";
import {
  CARENCIA_DIAS,
  SAQUE_MINIMO,
  comissaoDe,
  linkDeIndicacao,
  mensagemDeConvite,
  percentualDoAfiliado,
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
    admin.from("assinaturas").select("owner_id, plano, status, proximo_vencimento, cortesia_ate, cortesia_em").in("owner_id", ids),
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
  // percentual negociado com o admin, ou o padrão
  const percentual = percentualDoAfiliado(afiliado.percentual);
  const comissaoPorMes = comissaoDe(PLANOS.marcon.valor, percentual);
  // no anual a comissão é a mesma porcentagem, sobre a cobrança de R$ 149, uma vez por ano
  const comissaoPorAno = comissaoDe(PLANOS.marcon.valorAnual, percentual);
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

  const LINHA = "flex items-center gap-3 border-t border-line px-4 py-3 first:border-t-0";

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Indique e ganhe" />

      <div className="flex flex-col gap-7">
        <CompartilharCard
          link={link}
          mensagem={mensagemDeConvite(link)}
          descricao={`Você ganha ${percentual}% de cada cobrança paga por quem assinar pelo seu link, enquanto a pessoa continuar assinando: ${formatBRL(comissaoPorMes)} por mês no mensal, ${formatBRL(comissaoPorAno)} por ano no anual.`}
        />

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

        {indicados.length === 0 ? (
          <EmptyState
            title="Ninguém indicado ainda"
            description="Mande o link pra quem vende no Marketplace ou no WhatsApp. Quando a pessoa criar a conta, ela aparece aqui."
          />
        ) : (
          <Grupo titulo="Quem você indicou" semPadding>
            {indicados.map((i) => {
              // selo só para o que pede atenção (pagamento pendente ou atrasado, teste acabando)
              const alerta = i.situacao?.tom === "warning";
              const detalhe = [i.negocio, `entrou em ${formatData(i.desde)}`, !alerta ? i.situacao?.texto : null]
                .filter(Boolean)
                .join(" · ");
              return (
                <div key={i.id} className={LINHA}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[17px] text-ink">{i.nome}</p>
                    <p className="text-[13px] text-ink-muted">{detalhe}</p>
                    {alerta && i.situacao && (
                      <p className="mt-1">
                        <Badge tone="warning">{i.situacao.texto}</Badge>
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 text-[17px] tabular-nums text-ink">{formatBRL(ganhoPorIndicado.get(i.id) ?? 0)}</span>
                </div>
              );
            })}
          </Grupo>
        )}

        {extrato.length > 0 && (
          <Grupo titulo="Extrato" semPadding>
            {extrato.map((linha) => {
              if (linha.tipo === "comissao") {
                const estornada = !!linha.c.estornada_em;
                const aLiberar = !estornada && new Date(linha.c.liberada_em) > new Date();
                const situacao = aLiberar ? `libera em ${formatData(linha.c.liberada_em.slice(0, 10))}` : estornada ? null : "liberada";
                return (
                  <div key={linha.c.id} className={LINHA}>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[17px] text-ink">Assinatura de {nomeDe.get(linha.c.indicado_id) ?? "alguém"}</p>
                      <p className="text-[13px] text-ink-muted">
                        {[formatData(linha.data.slice(0, 10)), situacao].filter(Boolean).join(" · ")}
                      </p>
                      {estornada && (
                        <p className="mt-1">
                          <Badge tone="negative">Estornada</Badge>
                        </p>
                      )}
                    </div>
                    <span className={`shrink-0 text-[17px] tabular-nums ${estornada ? "text-ink-muted line-through" : "text-ink"}`}>
                      {formatBRL(Number(linha.c.valor))}
                    </span>
                  </div>
                );
              }
              const s = linha.s;
              return (
                <div key={s.id} className={LINHA}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[17px] text-ink">Saque por PIX</p>
                    <p className="truncate text-[13px] text-ink-muted">
                      {[formatData(linha.data.slice(0, 10)), s.status === "pago" ? "pago" : null, s.chave_pix].filter(Boolean).join(" · ")}
                    </p>
                    {s.status !== "pago" && (
                      <p className="mt-1">
                        <Badge tone={s.status === "recusado" ? "negative" : "warning"}>
                          {s.status === "recusado" ? "Recusado" : "Aguardando pagamento"}
                        </Badge>
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 text-[17px] tabular-nums text-ink">− {formatBRL(Number(s.valor))}</span>
                </div>
              );
            })}
          </Grupo>
        )}

        <Grupo titulo="Regras" semPadding>
          <p className={`${LINHA} text-[15px] text-ink`}>
            {percentual}% de cada cobrança paga, mensal ou anual, inclusive nas renovações.
          </p>
          <p className={`${LINHA} text-[15px] text-ink`}>
            Vira saldo {CARENCIA_DIAS} dias depois do pagamento, quando passa o prazo de estorno do cartão.
          </p>
          <p className={`${LINHA} text-[15px] text-ink`}>Saque por PIX, a partir de {formatBRL(SAQUE_MINIMO)}.</p>
          <p className={`${LINHA} text-[15px] text-ink`}>Pagamento estornado cancela a comissão dele.</p>
          <p className={`${LINHA} text-[15px] text-ink`}>Vale só para conta nova. Indicar a própria conta não conta.</p>
        </Grupo>
      </div>
    </div>
  );
}
