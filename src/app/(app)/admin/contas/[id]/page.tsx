import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { adminConfirmado, ehAdmin, registrarAdmin } from "@/lib/admin";
import { rotuloDaSituacao, situacaoDaAssinatura } from "@/lib/assinatura";
import { formatBRL, formatData, formatDataCurta } from "@/lib/format";
import { ErrorMessage, PageHeader, StatCard } from "@/components/ui";
import { Grupo, LinhaInfo } from "@/components/ajustes";
import { AcoesConta } from "../../acoes-conta";
import { AssistenteDaConta } from "../../assistente-da-conta";
import { assistenteAtivo } from "@/lib/whatsapp/evolution";
import { telefoneMascarado } from "@/lib/whatsapp/vinculo";
import { bloqueada, type DetalheConta } from "../../dados";

export const metadata: Metadata = { title: "Conta" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PRODUTOS_NA_TELA = 50;

// Detalhe de uma conta para o admin. Só leitura: números, produtos e últimas vendas. Não mostra
// nome de cliente de ninguém: o admin não precisa disso. Cada abertura fica no admin_registro.
export default async function ContaAdminPage({ params }: PageProps<"/admin/contas/[id]">) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!(await adminConfirmado(user))) notFound();

  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const admin = createAdminClient();
  if (!admin) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title="Conta" back={{ href: "/admin", label: "Administração" }} />
        <ErrorMessage>Defina SUPABASE_SERVICE_ROLE_KEY no servidor.</ErrorMessage>
      </div>
    );
  }

  const [{ data: alvo }, { data: assinatura }, { data, error }, { data: liberado }, { data: vinculo }] = await Promise.all([
    admin.auth.admin.getUserById(id),
    admin.from("assinaturas").select("plano, status, proximo_vencimento").eq("owner_id", id).maybeSingle(),
    admin.rpc("admin_conta_detalhe", { p_owner: id }),
    admin.from("whatsapp_liberados").select("lancar").eq("owner_id", id).maybeSingle(),
    admin.from("whatsapp_vinculos").select("telefone").eq("owner_id", id).maybeSingle(),
  ]);
  const conta = alvo?.user;
  if (!conta) notFound();
  await registrarAdmin(user!.id, "ver_conta", id);

  const detalhe = data as DetalheConta | null;
  const situacao = situacaoDaAssinatura(assinatura ?? null, conta.created_at);
  const rotulo = rotuloDaSituacao(situacao);
  const titulo =
    (conta.user_metadata?.nome_negocio as string | undefined) ||
    (conta.user_metadata?.nome as string | undefined) ||
    (conta.user_metadata?.full_name as string | undefined) ||
    conta.email ||
    "Sem nome";
  const r = detalhe?.resumo;
  const lucroMes = Number(r?.lucro_mes ?? 0);
  const eAdmin = ehAdmin(conta);
  // admin do Marcon nos dois fatores: tem o assistente liberado sem interruptor
  const contaAdmin = await adminConfirmado(conta);
  const pagante = situacao.tipo === "ativa" || situacao.tipo === "atrasada";

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={titulo} description={conta.email} back={{ href: "/admin", label: "Administração" }} />

      {error || !detalhe ? (
        <ErrorMessage>Não consegui ler os dados desta conta. Rode a migration 0048_admin_seguro.sql.</ErrorMessage>
      ) : (
        <div className="flex flex-col gap-7">
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Vendido no mês" value={formatBRL(Number(r?.valor_mes ?? 0))} hint={`${r?.vendas_mes ?? 0} vendas`} />
            <StatCard label="Lucro no mês" value={formatBRL(lucroMes)} tone={lucroMes < 0 ? "negative" : "positive"} />
            <StatCard label="Total vendido" value={formatBRL(Number(r?.valor_total ?? 0))} hint={`${r?.vendas_total ?? 0} vendas desde o início`} />
            <StatCard
              label="Estoque parado"
              value={formatBRL(Number(detalhe.estoque.valor_custo))}
              hint={`${detalhe.estoque.unidades} unidades em ${detalhe.estoque.produtos_ativos} produtos`}
            />
          </div>

          <Grupo titulo="Conta" semPadding>
            <LinhaInfo rotulo="Plano" valor={bloqueada(conta) ? "Bloqueada" : situacao.tipo === "cortesia" ? "Cortesia" : rotulo.texto} />
            <LinhaInfo rotulo="Desde" valor={formatData(conta.created_at.slice(0, 10))} />
            <LinhaInfo rotulo="Último acesso" valor={conta.last_sign_in_at ? formatDataCurta(conta.last_sign_in_at.slice(0, 10)) : "Nunca"} />
            <LinhaInfo rotulo="Última venda" valor={r?.ultima_venda ? formatDataCurta(r.ultima_venda) : "Nenhuma"} />
            <LinhaInfo rotulo="Clientes" valor={detalhe.clientes} />
          </Grupo>

          {detalhe.mais_vendidos.length > 0 && (
            <Grupo titulo="Mais vendidos em 90 dias" semPadding>
              <ul className="divide-y divide-line">
                {detalhe.mais_vendidos.map((p) => (
                  <li key={p.nome} className="flex items-center gap-3 px-4 py-3">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[17px] text-ink">{p.nome}</span>
                      <span className="block text-[13px] text-ink-muted">{p.unidades} unidades</span>
                    </span>
                    <span className="shrink-0 text-[17px] tabular-nums text-ink">{formatBRL(Number(p.valor))}</span>
                  </li>
                ))}
              </ul>
            </Grupo>
          )}

          <Grupo titulo="Últimas vendas" semPadding>
            {detalhe.ultimas_vendas.length === 0 ? (
              <p className="px-4 py-3 text-[15px] text-ink-muted">Nenhuma venda ainda.</p>
            ) : (
              <ul className="divide-y divide-line">
                {detalhe.ultimas_vendas.map((v, i) => {
                  const cancelada = v.status === "cancelada";
                  return (
                    <li key={`${v.criada}-${i}`}className={`flex items-center gap-3 px-4 py-3 ${cancelada ? "opacity-50" : ""}`}>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[17px] text-ink">{formatDataCurta(v.data)}</span>
                        <span className="block truncate text-[13px] text-ink-muted">
                          {cancelada ? "Cancelada" : [`${v.itens} ${v.itens === 1 ? "item" : "itens"}`, v.pagamento].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className={`block text-[17px] tabular-nums text-ink ${cancelada ? "line-through" : ""}`}>{formatBRL(Number(v.valor))}</span>
                        {!cancelada && (
                          <span className={`block text-[13px] tabular-nums ${Number(v.lucro) < 0 ? "text-danger" : "text-positive"}`}>
                            lucro {formatBRL(Number(v.lucro))}
                          </span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Grupo>

          <Grupo
            titulo={`Produtos (${detalhe.estoque.produtos_ativos})`}
            semPadding
            rodape={detalhe.produtos.length > PRODUTOS_NA_TELA ? `Mostrando os ${PRODUTOS_NA_TELA} primeiros, em ordem alfabética.` : undefined}
          >
            {detalhe.produtos.length === 0 ? (
              <p className="px-4 py-3 text-[15px] text-ink-muted">Nenhum produto ativo.</p>
            ) : (
              <ul className="divide-y divide-line">
                {detalhe.produtos.slice(0, PRODUTOS_NA_TELA).map((p, i) => (
                  <li key={`${p.nome}-${i}`} className="flex items-center gap-3 px-4 py-3">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[17px] text-ink">{p.nome}</span>
                      <span className={`block text-[13px] ${Number(p.estoque) <= 0 ? "text-danger" : "text-ink-muted"}`}>
                        {Number(p.estoque) <= 0 ? "Sem estoque" : `${p.estoque} em estoque`}
                      </span>
                    </span>
                    <span className="shrink-0 text-[17px] tabular-nums text-ink">{formatBRL(Number(p.preco))}</span>
                  </li>
                ))}
              </ul>
            )}
          </Grupo>

          <Grupo
            titulo="Assistente no WhatsApp"
            semPadding
            rodape={
              !assistenteAtivo()
                ? "A chave geral está desligada (WHATSAPP_ASSISTENTE_ATIVO): ninguém usa agora."
                : vinculo
                  ? `Número vinculado: final ${telefoneMascarado(vinculo.telefone).replace("...", "")}.`
                  : "Nenhum número vinculado ainda. A pessoa vincula em Configurações."
            }
          >
            {contaAdmin ? (
              <LinhaInfo rotulo="Liberado" valor="Tudo, por ser admin" />
            ) : (
              <AssistenteDaConta id={conta.id} usar={!!liberado} lancar={liberado?.lancar === true} />
            )}
          </Grupo>

          {/* ações sobre a conta no fim da tela, como manda o padrão */}
          {(!pagante || !eAdmin) && (
            <Grupo titulo="Ações">
              <AcoesConta
                id={conta.id}
                email={conta.email ?? ""}
                bloqueada={bloqueada(conta)}
                cortesia={situacao.tipo === "cortesia"}
                pagante={pagante}
                podeBloquear={!eAdmin}
              />
            </Grupo>
          )}
        </div>
      )}
    </div>
  );
}
