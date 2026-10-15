import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { adminConfirmado, registrarAdmin } from "@/lib/admin";
import { rotuloDaSituacao, situacaoDaAssinatura } from "@/lib/assinatura";
import { formatBRL, formatData, formatDataCurta } from "@/lib/format";
import { ErrorMessage, PageHeader, StatCard } from "@/components/ui";
import { Grupo, LinhaInfo } from "@/components/ajustes";
import { AcoesConta } from "../../acoes-conta";
import { GerenciarConta } from "../../gerenciar-conta";
import { bloqueada, contaGerenciavel, type DetalheConta } from "../../dados";
import { VendasDaConta } from "./vendas-da-conta";

export const metadata: Metadata = { title: "Conta" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// a lista de produtos vai inteira para o navegador; acima disso, corta
const PRODUTOS_NO_MAXIMO = 300;

// Detalhe de uma conta para o admin, na ordem: o que se muda (cortesia, assistente), a conta, os
// números de venda e, no fim, bloquear. Não mostra nome de cliente de ninguém: o admin não precisa
// disso. Cada abertura fica no admin_registro.
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
    admin.from("assinaturas").select("plano, status, proximo_vencimento, cortesia_ate, cortesia_em, cortesia_motivo").eq("owner_id", id).maybeSingle(),
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
  const gerenciavel = contaGerenciavel(conta, {
    titulo,
    situacao,
    motivo: assinatura?.cortesia_motivo,
    // admin do Marcon nos dois fatores: assistente liberado sem interruptor, e não se bloqueia
    admin: await adminConfirmado(conta),
    liberado,
    telefone: vinculo?.telefone,
  });

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={titulo} description={conta.email} back={{ href: "/admin", label: "Administração" }} />

      <div className="flex flex-col gap-7">
        {/* primeiro o que o admin muda; os números vêm depois */}
        <GerenciarConta conta={gerenciavel} />

        <Grupo titulo="Conta" semPadding>
          <LinhaInfo rotulo="Plano" valor={bloqueada(conta) ? "Bloqueada" : rotulo.texto} />
          <LinhaInfo rotulo="Desde" valor={formatData(conta.created_at.slice(0, 10))} />
          <LinhaInfo rotulo="Último acesso" valor={conta.last_sign_in_at ? formatDataCurta(conta.last_sign_in_at.slice(0, 10)) : "Nunca"} />
          {detalhe && <LinhaInfo rotulo="Última venda" valor={r?.ultima_venda ? formatDataCurta(r.ultima_venda) : "Nenhuma"} />}
          {detalhe && <LinhaInfo rotulo="Clientes" valor={detalhe.clientes} />}
        </Grupo>

        {error || !detalhe ? (
          <ErrorMessage>Não consegui ler as vendas desta conta. Rode a migration 0048_admin_seguro.sql.</ErrorMessage>
        ) : (
          <section className="flex flex-col gap-3">
            <h2 className="px-4 text-[13px] uppercase text-ink-muted">Vendas</h2>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard label="No mês" value={formatBRL(Number(r?.valor_mes ?? 0))} hint={`${r?.vendas_mes ?? 0} vendas`} />
              <StatCard label="Lucro no mês" value={formatBRL(lucroMes)} tone={lucroMes < 0 ? "negative" : "positive"} />
              <StatCard label="Desde o início" value={formatBRL(Number(r?.valor_total ?? 0))} hint={`${r?.vendas_total ?? 0} vendas`} />
              <StatCard
                label="Estoque parado"
                value={formatBRL(Number(detalhe.estoque.valor_custo))}
                hint={`${detalhe.estoque.unidades} un. em ${detalhe.estoque.produtos_ativos} produtos`}
              />
            </div>
            <VendasDaConta
              detalhe={{
                mais_vendidos: detalhe.mais_vendidos,
                ultimas_vendas: detalhe.ultimas_vendas,
                produtos: detalhe.produtos.slice(0, PRODUTOS_NO_MAXIMO),
                estoque: detalhe.estoque,
              }}
            />
          </section>
        )}

        {/* bloquear no fim da tela, como manda o padrão */}
        {gerenciavel.podeBloquear && (
          <Grupo>
            <AcoesConta id={conta.id} email={conta.email ?? ""} bloqueada={gerenciavel.bloqueada} />
          </Grupo>
        )}
      </div>
    </div>
  );
}
