import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import type { CanalVenda, FormaPagamento } from "@/types/domain";
import { Card, PageHeader } from "@/components/ui";
import { ListaSimples } from "./lista-simples";
import { criarCanal, excluirCanal, criarFormaPagamento, excluirFormaPagamento } from "./actions";
import { NotificacoesConfig } from "./notificacoes-config";
import { NotificacoesPreferencias } from "./notificacoes-preferencias";
import { lerPreferencias } from "@/lib/notificacoes";
import { PerfilForm } from "./perfil-form";
import { EmpresaForm } from "./empresa-form";
import { AssinaturaCard, type AssinaturaAtual } from "./assinatura-card";
import { asaasConfigurado } from "@/lib/asaas";
import { DIAS_DE_TESTE, fimDoTeste, testeEmAndamento } from "@/lib/planos";

export const metadata: Metadata = { title: "Configurações" };

export default async function ConfiguracoesPage({ searchParams }: PageProps<"/configuracoes">) {
  const sp = await searchParams;
  const supabase = await createClient();
  const [
    {
      data: { user },
    },
    { data: canais },
    { data: formas },
    { data: assinaturaRow },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("canais_venda").select("*").order("nome"),
    supabase.from("formas_pagamento").select("*").order("nome"),
    supabase.from("assinaturas").select("plano, status, proximo_vencimento").maybeSingle(),
  ]);
  const fimTeste = fimDoTeste(user?.created_at ?? new Date());
  const assinatura: AssinaturaAtual | null = assinaturaRow
    ? {
        plano: assinaturaRow.plano,
        status: assinaturaRow.status,
        proximoVencimento: assinaturaRow.proximo_vencimento,
      }
    : null;

  const meta = user?.user_metadata ?? {};
  const nome = (meta.nome as string | undefined) ?? (meta.full_name as string | undefined) ?? (meta.name as string | undefined) ?? "";
  const nomeNegocio = (meta.nome_negocio as string | undefined) ?? "";
  const logoPath = meta.empresa_logo_path as string | undefined;
  const { data: logoSignedUrl } = logoPath
    ? await supabase.storage.from("logo-empresa").createSignedUrl(logoPath, 3600)
    : { data: null };

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Configurações" description="Seu perfil, dados da empresa, cadastros auxiliares e notificações." />

      <div className="flex flex-col gap-6">
        <Card title="Perfil">
          <PerfilForm nome={nome} email={user?.email ?? ""} />
        </Card>

        <Card title="Dados da empresa" description="O nome aparece no menu; o resto é opcional e vai nos recibos.">
          <EmpresaForm
            nomeNegocio={nomeNegocio}
            telefone={(meta.empresa_telefone as string | undefined) ?? ""}
            email={(meta.empresa_email as string | undefined) ?? ""}
            endereco={(meta.empresa_endereco as string | undefined) ?? ""}
            documento={(meta.empresa_documento as string | undefined) ?? ""}
            logoUrl={logoSignedUrl?.signedUrl ?? null}
          />
        </Card>

        <Card title="Assinatura" description="Seu plano do Marcon. A cobrança é feita pelo Asaas.">
          <AssinaturaCard
            assinatura={assinatura}
            fimDoTeste={fimTeste.toISOString()}
            emTeste={testeEmAndamento(fimTeste)}
            diasDeTeste={DIAS_DE_TESTE}
            cobrancaDisponivel={asaasConfigurado()}
            voltouDoPagamento={sp.assinatura === "ok"}
          />
        </Card>

        <Card title="Canais de venda" description="Onde você vende. Aparecem na venda e nos anúncios por canal.">
          <ListaSimples
            itens={(canais ?? []) as CanalVenda[]}
            placeholder="Ex: Instagram, Mercado Livre..."
            sugestoes={["Loja física", "WhatsApp", "Instagram", "Mercado Livre", "Shopee"]}
            onCriar={criarCanal}
            onExcluir={excluirCanal}
          />
        </Card>

        <Card title="Formas de pagamento">
          <ListaSimples
            itens={(formas ?? []) as FormaPagamento[]}
            placeholder="Ex: PIX, Dinheiro, Cartão..."
            sugestoes={["PIX", "Dinheiro", "Cartão de crédito", "Cartão de débito"]}
            onCriar={criarFormaPagamento}
            onExcluir={excluirFormaPagamento}
          />
        </Card>

        <Card title="Notificações">
          <NotificacoesConfig />
        </Card>

        <Card
          title="O que aparece nas notificações"
          description="Os avisos mudam de frase a cada vez, é surpresa. Aqui você escolhe o que receber e quais dados mostrar."
        >
          <NotificacoesPreferencias atual={lerPreferencias(meta)} />
        </Card>
      </div>
    </div>
  );
}
