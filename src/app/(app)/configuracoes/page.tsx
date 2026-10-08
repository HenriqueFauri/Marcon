import type { Metadata } from "next";
import Link from "next/link";
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
import { WhatsappCard } from "./whatsapp-card";
import { assistenteAtivo, contaPodeEscrever, contaPodeUsar, escritaAtiva } from "@/lib/whatsapp/evolution";
import { PREFIXO, telefoneMascarado } from "@/lib/whatsapp/vinculo";

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

  const whatsappLiberado = assistenteAtivo() && contaPodeUsar(user?.email);
  const { data: vinculoWhatsapp } = whatsappLiberado ? await supabase.from("whatsapp_vinculos").select("telefone").maybeSingle() : { data: null };

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

        {whatsappLiberado && (
          <Card title="Assistente no WhatsApp">
            <WhatsappCard
              vinculadoFinal={vinculoWhatsapp ? telefoneMascarado(vinculoWhatsapp.telefone) : null}
              numeroDoMarcon={(process.env.WHATSAPP_NUMERO ?? "").replace(/D/g, "")}
              prefixo={PREFIXO}
              podeLancar={escritaAtiva() && contaPodeEscrever(user?.email)}
            />
          </Card>
        )}

        <Card title="Importar dados" description="Trouxe seus produtos, vendas e caixa de outro sistema? Traga tudo de uma vez.">
          <Link href="/importar" className="text-[14px] font-medium text-brand-text underline-offset-2 hover:underline">
            Importar de PDF
          </Link>
        </Card>

        <Card title="Canais de venda" description="Onde você vende. Aparecem na venda e nos anúncios por canal.">
          <ListaSimples
            itens={(canais ?? []) as CanalVenda[]}
            placeholder="Ex: Facebook Marketplace, OLX..."
            sugestoes={["Facebook Marketplace", "OLX", "WhatsApp", "Instagram", "Mercado Livre"]}
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
