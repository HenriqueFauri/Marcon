import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import type { CanalVenda, FormaPagamento } from "@/types/domain";
import { Card, PageHeader } from "@/components/ui";
import { ListaSimples } from "./lista-simples";
import { criarCanal, excluirCanal, criarFormaPagamento, excluirFormaPagamento } from "./actions";
import { NotificacoesConfig } from "./notificacoes-config";
import { PerfilForm } from "./perfil-form";
import { EmpresaForm } from "./empresa-form";

export const metadata: Metadata = { title: "Configurações" };

export default async function ConfiguracoesPage() {
  const supabase = await createClient();
  const [
    {
      data: { user },
    },
    { data: canais },
    { data: formas },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("canais_venda").select("*").order("nome"),
    supabase.from("formas_pagamento").select("*").order("nome"),
  ]);

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
          <PerfilForm nome={nome} nomeNegocio={nomeNegocio} email={user?.email ?? ""} />
        </Card>

        <Card title="Dados da empresa" description="Opcional — usados em recibos e documentos.">
          <EmpresaForm
            telefone={(meta.empresa_telefone as string | undefined) ?? ""}
            email={(meta.empresa_email as string | undefined) ?? ""}
            endereco={(meta.empresa_endereco as string | undefined) ?? ""}
            documento={(meta.empresa_documento as string | undefined) ?? ""}
            logoUrl={logoSignedUrl?.signedUrl ?? null}
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
      </div>
    </div>
  );
}
