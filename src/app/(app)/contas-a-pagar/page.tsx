import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { formatBRL, formatData, hojeISO, somarDias } from "@/lib/format";
import { Grupo } from "@/components/ajustes";
import { Badge, EmptyState, ErrorMessage, Segmentos, StatCard, btnPrimary } from "@/components/ui";
import { IconPlus } from "@/components/icons";
import { CaixaTopo } from "../caixa/topo";
import { atualizarConta, criarConta, excluirConta } from "./actions";
import { ContaModal } from "./conta-modal";
import { PagarButton } from "./pagar-button";
import { DesfazerPagamento } from "./desfazer-pagamento";

export const metadata: Metadata = { title: "Caixa" };

interface Conta {
  id: string;
  descricao: string;
  valor: number;
  vencimento: string;
  recorrencia: string;
  categoria: string;
  fornecedor_id: string | null;
  status: "aberta" | "paga";
  data_pagamento: string | null;
  fornecedores: { nome: string } | null;
}

const FILTROS = [
  { valor: "abertas", label: "Em aberto" },
  { valor: "atrasadas", label: "Atrasadas" },
  { valor: "pagas", label: "Pagas" },
] as const;

type Filtro = (typeof FILTROS)[number]["valor"];

const contasTexto = (n: number) => `${n} ${n === 1 ? "conta" : "contas"}`;

export default async function ContasAPagarPage({ searchParams }: PageProps<"/contas-a-pagar">) {
  const sp = await searchParams;
  const filtro: Filtro = FILTROS.some((f) => f.valor === sp.status) ? (sp.status as Filtro) : "abertas";

  const supabase = await createClient();
  const [{ data, error }, { data: fornecedoresData }] = await Promise.all([
    supabase
      .from("contas_a_pagar")
      .select("id, descricao, valor, vencimento, recorrencia, categoria, fornecedor_id, status, data_pagamento, fornecedores(nome)")
      .order("vencimento")
      .limit(1000),
    supabase.from("fornecedores").select("id, nome").order("nome"),
  ]);
  const fornecedores = (fornecedoresData ?? []) as { id: string; nome: string }[];

  const nova = (
    <ContaModal
      titulo="Nova conta a pagar"
      trigger={
        <>
          <IconPlus width={16} height={16} /> Nova conta
        </>
      }
      triggerClassName={btnPrimary}
      fornecedores={fornecedores}
      onSave={criarConta}
      successMessage="Conta cadastrada."
    />
  );

  if (error) {
    return (
      <div>
        <CaixaTopo aba="pagar" action={nova} />
        <ErrorMessage>Não foi possível carregar o que você tem a pagar: {error.message}</ErrorMessage>
      </div>
    );
  }

  const contas = (data ?? []) as unknown as Conta[];
  const hoje = hojeISO();
  const em7dias = somarDias(hoje, 7);
  const abertas = contas.filter((c) => c.status === "aberta");
  const atrasadas = abertas.filter((c) => c.vencimento < hoje);
  const proximas = abertas.filter((c) => c.vencimento >= hoje && c.vencimento <= em7dias);
  const pagas = contas.filter((c) => c.status === "paga").sort((a, b) => (b.data_pagamento ?? "").localeCompare(a.data_pagamento ?? ""));
  const soma = (lista: Conta[]) => lista.reduce((s, c) => s + Number(c.valor), 0);

  const visiveis = { abertas, atrasadas, pagas }[filtro];

  return (
    <div>
      <CaixaTopo aba="pagar" action={nova} />

      <div className="flex flex-col gap-7">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <StatCard label="Em aberto" value={formatBRL(soma(abertas))} hint={contasTexto(abertas.length)} />
          <StatCard
            label="Atrasado"
            value={formatBRL(soma(atrasadas))}
            tone={atrasadas.length ? "negative" : "neutral"}
            hint={contasTexto(atrasadas.length)}
          />
          <StatCard
            label="Vence em 7 dias"
            value={formatBRL(soma(proximas))}
            hint={contasTexto(proximas.length)}
            className="col-span-2 lg:col-span-1"
          />
        </div>

        <Segmentos
          rotulo="Filtrar contas"
          className="sm:w-[24rem]"
          itens={FILTROS.map((f) => ({
            href: f.valor === "abertas" ? "/contas-a-pagar" : `/contas-a-pagar?status=${f.valor}`,
            label:
              f.valor === "atrasadas" && atrasadas.length > 0 ? (
                <>
                  {f.label} <span className="text-danger">{atrasadas.length}</span>
                </>
              ) : (
                f.label
              ),
            ativo: filtro === f.valor,
          }))}
        />

        {visiveis.length === 0 ? (
          <EmptyState
            title={contas.length === 0 ? "Nada a pagar" : "Nada por aqui"}
            description={
              contas.length === 0
                ? "Cadastre o aluguel, a internet ou um boleto. Marcou como paga, a saída entra no caixa."
                : "Nenhuma conta neste filtro."
            }
            action={contas.length === 0 ? nova : undefined}
          />
        ) : (
          <Grupo
            semPadding
            rodape={filtro === "pagas" ? "Toque na conta pra ver o pagamento ou desfazer." : "Toque na conta para editar. Conta que repete todo mês abre a do mês seguinte quando você paga."}
          >
            <ul className="divide-y divide-line">
              {visiveis.map((c) => {
                const atrasada = c.status === "aberta" && c.vencimento < hoje;
                const detalhe = [
                  c.status === "paga" && c.data_pagamento
                    ? `paga em ${formatData(c.data_pagamento)}`
                    : `${atrasada ? "venceu" : "vence"} ${formatData(c.vencimento)}`,
                  c.fornecedores?.nome,
                  c.recorrencia === "mensal" ? "todo mês" : null,
                ]
                  .filter(Boolean)
                  .join(" · ");
                const texto = (
                  <>
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[17px] text-ink">{c.descricao}</span>
                      {atrasada && <Badge tone="negative">Atrasada</Badge>}
                    </span>
                    <span className="block truncate text-[13px] text-ink-muted">{detalhe}</span>
                  </>
                );
                return (
                  <li key={c.id} className="flex items-center gap-3 px-4 py-3">
                    {c.status === "aberta" ? (
                      // a conta em aberto abre a janela de editar, com excluir no fim
                      <ContaModal
                        titulo="Editar conta"
                        trigger={texto}
                        triggerClassName="block min-w-0 flex-1 text-left"
                        valores={{
                          descricao: c.descricao,
                          valor: Number(c.valor),
                          vencimento: c.vencimento,
                          recorrencia: c.recorrencia,
                          categoria: c.categoria,
                          fornecedor_id: c.fornecedor_id,
                        }}
                        fornecedores={fornecedores}
                        onSave={atualizarConta.bind(null, c.id)}
                        successMessage="Conta atualizada."
                        excluir={{
                          titulo: `Excluir “${c.descricao}”?`,
                          descricao:
                            c.recorrencia === "mensal"
                              ? "Só essa conta sai da lista. A do mês seguinte só existe depois que você paga esta, então ela para de se repetir."
                              : "A conta sai da lista.",
                          onConfirm: excluirConta.bind(null, c.id),
                        }}
                      />
                    ) : (
                      // a conta paga abre os dados do pagamento, com desfazer no fim
                      <DesfazerPagamento
                        id={c.id}
                        descricao={c.descricao}
                        valor={Number(c.valor)}
                        dataPagamento={c.data_pagamento}
                        vencimento={c.vencimento}
                        mensal={c.recorrencia === "mensal"}
                        fornecedor={c.fornecedores?.nome}
                        trigger={texto}
                        triggerClassName="block min-w-0 flex-1 text-left"
                      />
                    )}
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <span className="text-[17px] tabular-nums text-ink">{formatBRL(c.valor)}</span>
                      {c.status === "aberta" && (
                        <PagarButton id={c.id} descricao={c.descricao} valor={Number(c.valor)} mensal={c.recorrencia === "mensal"} />
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Grupo>
        )}
      </div>
    </div>
  );
}
