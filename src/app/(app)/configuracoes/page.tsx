import { createClient } from "@/lib/supabase/server";
import type { CanalVenda, FormaPagamento } from "@/types/domain";
import { ListaSimples } from "./lista-simples";
import { criarCanal, excluirCanal, criarFormaPagamento, excluirFormaPagamento } from "./actions";
import { NotificacoesConfig } from "./notificacoes-config";
import { PerfilForm } from "./perfil-form";
import { EmpresaForm } from "./empresa-form";

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

  const nome =
    (user?.user_metadata?.nome as string | undefined) ??
    (user?.user_metadata?.full_name as string | undefined) ??
    (user?.user_metadata?.name as string | undefined) ??
    "";
  const nomeNegocio = (user?.user_metadata?.nome_negocio as string | undefined) ?? "";
  const logoPath = user?.user_metadata?.empresa_logo_path as string | undefined;
  const { data: logoSignedUrl } = logoPath
    ? await supabase.storage.from("logo-empresa").createSignedUrl(logoPath, 3600)
    : { data: null };

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-white">Configurações</h1>
        <p className="text-sm text-neutral-400">Canais de venda, formas de pagamento e notificações.</p>
      </div>

      <div className="flex flex-col gap-6">
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
          <h2 className="mb-3 text-sm font-semibold text-white">Perfil</h2>
          <PerfilForm nome={nome} nomeNegocio={nomeNegocio} email={user?.email ?? ""} />
        </div>

        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
          <h2 className="mb-1 text-sm font-semibold text-white">Dados da empresa</h2>
          <p className="mb-3 text-xs text-neutral-500">Opcional — usados quando a emissão de recibos existir.</p>
          <EmpresaForm
            telefone={(user?.user_metadata?.empresa_telefone as string | undefined) ?? ""}
            email={(user?.user_metadata?.empresa_email as string | undefined) ?? ""}
            endereco={(user?.user_metadata?.empresa_endereco as string | undefined) ?? ""}
            documento={(user?.user_metadata?.empresa_documento as string | undefined) ?? ""}
            logoUrl={logoSignedUrl?.signedUrl ?? null}
          />
        </div>

        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
          <h2 className="mb-3 text-sm font-semibold text-white">Canais de venda</h2>
          <ListaSimples
            itens={(canais ?? []) as CanalVenda[]}
            placeholder="Ex: Instagram, Mercado Livre..."
            onCriar={criarCanal}
            onExcluir={excluirCanal}
          />
        </div>

        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
          <h2 className="mb-3 text-sm font-semibold text-white">Formas de pagamento</h2>
          <ListaSimples
            itens={(formas ?? []) as FormaPagamento[]}
            placeholder="Ex: PIX, Dinheiro, Cartão..."
            onCriar={criarFormaPagamento}
            onExcluir={excluirFormaPagamento}
          />
        </div>

        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
          <h2 className="mb-3 text-sm font-semibold text-white">Notificações</h2>
          <NotificacoesConfig />
        </div>
      </div>
    </div>
  );
}
