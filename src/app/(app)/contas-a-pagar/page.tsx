import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { formatBRL, formatData, hojeISO, somarDias } from "@/lib/format";
import { ConfirmButton } from "@/components/confirm-button";
import { Grupo } from "@/components/ajustes";
import { EmptyState, ErrorMessage, PageHeader, Segmentos, StatCard, btnIcon, btnPrimary } from "@/components/ui";
import { IconPencil, IconPlus } from "@/components/icons";
import { atualizarConta, criarConta, excluirConta } from "./actions";
import { ContaModal } from "./conta-modal";
import { PagarButton } from "./pagar-button";

export const metadata: Metadata = { title: "Contas a pagar" };

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
        <PageHeader title="Contas a pagar" action={nova} />
        <ErrorMessage>Não foi possível carregar as contas a pagar: {error.message}</ErrorMessage>
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
    <div className="flex flex-col gap-7">
      <PageHeader title="Contas a pagar" action={nova} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="Total em aberto" value={formatBRL(soma(abertas))} tone="warning" hint={`${abertas.length} conta(s)`} />
        <StatCard
          label="Atrasado"
          value={formatBRL(soma(atrasadas))}
          tone={atrasadas.length ? "negative" : "neutral"}
          hint={`${atrasadas.length} conta(s)`}
        />
        <StatCard label="Vence em 7 dias" value={formatBRL(soma(proximas))} hint={`${proximas.length} conta(s)`} />
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
          title={contas.length === 0 ? "Nenhuma conta a pagar" : "Nada por aqui"}
          description={
            contas.length === 0
              ? "Cadastre o aluguel, a internet ou um boleto. Marcou como paga, a saída entra no caixa."
              : "Nenhuma conta neste filtro."
          }
          action={contas.length === 0 ? nova : undefined}
        />
      ) : (
        <Grupo semPadding rodape={filtro === "pagas" ? undefined : "Conta que repete todo mês abre a do mês seguinte quando você marca como paga."}>
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
              return (
                <li key={c.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[17px] text-ink">{c.descricao}</p>
                    <p className={`text-[13px] ${atrasada ? "text-danger" : "text-ink-muted"}`}>
                      {atrasada ? "Atrasada: " : ""}
                      {detalhe}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <span className="text-[17px] tabular-nums text-ink">{formatBRL(c.valor)}</span>
                    {c.status === "aberta" && (
                      <PagarButton id={c.id} descricao={c.descricao} valor={Number(c.valor)} mensal={c.recorrencia === "mensal"} />
                    )}
                  </div>
                  {c.status === "aberta" && (
                    <div className="flex shrink-0 flex-col items-center">
                      <ContaModal
                        titulo="Editar conta"
                        trigger={<IconPencil width={16} height={16} />}
                        triggerClassName={btnIcon}
                        triggerLabel={`Editar ${c.descricao}`}
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
                      />
                      <ConfirmButton
                        title={`Excluir “${c.descricao}”?`}
                        description={
                          c.recorrencia === "mensal"
                            ? "Só essa conta sai da lista. Se ela repete todo mês, a do mês seguinte só existe depois que você pagar esta, então ela para de se repetir."
                            : "A conta sai da lista."
                        }
                        ariaLabel={`Excluir ${c.descricao}`}
                        successMessage="Conta excluída."
                        onConfirm={excluirConta.bind(null, c.id)}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Grupo>
      )}
    </div>
  );
}
