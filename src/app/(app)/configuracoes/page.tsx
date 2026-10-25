import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import type { CanalVenda, FormaPagamento } from "@/types/domain";
import { PageHeader } from "@/components/ui";
import { ListaSimples } from "./lista-simples";
import { criarCanal, excluirCanal, criarFormaPagamento, excluirFormaPagamento } from "./actions";
import { NotificacoesConfig } from "./notificacoes-config";
import { NotificacoesPreferencias } from "./notificacoes-preferencias";
import { lerPreferencias } from "@/lib/notificacoes";
import { PerfilForm } from "./perfil-form";
import { EmpresaForm } from "./empresa-form";
import { Grupo, LinhaLink } from "@/components/ajustes";
import { IconBox, IconWhatsapp } from "@/components/icons";
import { acessoDoAssistente } from "@/lib/whatsapp/acesso";

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

  const whatsappLiberado = (await acessoDoAssistente(user)).usar;
  const { data: vinculoWhatsapp } = whatsappLiberado ? await supabase.from("whatsapp_vinculos").select("owner_id").maybeSingle() : { data: null };

  const meta = user?.user_metadata ?? {};
  const nome = (meta.nome as string | undefined) ?? (meta.full_name as string | undefined) ?? (meta.name as string | undefined) ?? "";
  const nomeNegocio = (meta.nome_negocio as string | undefined) ?? "";
  const logoPath = meta.empresa_logo_path as string | undefined;
  const { data: logoSignedUrl } = logoPath
    ? await supabase.storage.from("logo-empresa").createSignedUrl(logoPath, 3600)
    : { data: null };

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Configurações" />

      <div className="flex flex-col gap-7">
        <Grupo semPadding rodape="Produtos, vendas e caixa de outro sistema, tudo de uma vez.">
          <LinhaLink
            href="/importar"
            icone={<IconBox className="h-[17px] w-[17px]" />}
            tom="bg-brand text-on-brand"
            rotulo="Trazer produtos e vendas"
            detalhe="Planilha ou PDF"
          />
          {whatsappLiberado && (
            <LinhaLink
              href="/configuracoes/whatsapp"
              icone={<IconWhatsapp className="h-[17px] w-[17px]" />}
              tom="bg-tile-positive text-on-tile-positive"
              rotulo="Assistente no WhatsApp"
              detalhe={vinculoWhatsapp ? "Vinculado" : "Ativar"}
            />
          )}
        </Grupo>

        <Grupo titulo="Perfil">
          <PerfilForm nome={nome} email={user?.email ?? ""} />
        </Grupo>

        <Grupo titulo="Empresa" rodape="O nome aparece no menu. O resto é opcional e vai no recibo; o PIX vai junto na cobrança pelo WhatsApp.">
          <EmpresaForm
            nomeNegocio={nomeNegocio}
            telefone={(meta.empresa_telefone as string | undefined) ?? ""}
            email={(meta.empresa_email as string | undefined) ?? ""}
            endereco={(meta.empresa_endereco as string | undefined) ?? ""}
            documento={(meta.empresa_documento as string | undefined) ?? ""}
            pix={(meta.empresa_pix as string | undefined) ?? ""}
            logoUrl={logoSignedUrl?.signedUrl ?? null}
          />
        </Grupo>

        <ListaSimples
          titulo="Canais de venda"
          rodape="Onde você vende. Você escolhe o canal na hora de registrar a venda."
          itens={(canais ?? []) as CanalVenda[]}
          placeholder="Ex: Facebook Marketplace, OLX..."
          sugestoes={["Facebook Marketplace", "OLX", "WhatsApp", "Instagram", "Mercado Livre"]}
          onCriar={criarCanal}
          onExcluir={excluirCanal}
        />

        <ListaSimples
          titulo="Formas de pagamento"
          itens={(formas ?? []) as FormaPagamento[]}
          placeholder="Ex: PIX, Dinheiro, Cartão..."
          sugestoes={["PIX", "Dinheiro", "Cartão de crédito", "Cartão de débito"]}
          onCriar={criarFormaPagamento}
          onExcluir={excluirFormaPagamento}
        />

        <NotificacoesConfig />

        <NotificacoesPreferencias atual={lerPreferencias(meta)} />

        <Grupo titulo="Dados" semPadding rodape="Planilha pra abrir no Excel ou guardar uma cópia.">
          <LinhaLink href="/api/exportar/produtos" externo rotulo="Produtos" detalhe="CSV" />
          <LinhaLink href="/api/exportar/vendas" externo rotulo="Vendas" detalhe="CSV" />
          <LinhaLink href="/api/exportar/clientes" externo rotulo="Clientes" detalhe="CSV" />
          <LinhaLink href="/api/exportar/caixa" externo rotulo="Caixa" detalhe="CSV" />
        </Grupo>
      </div>
    </div>
  );
}
