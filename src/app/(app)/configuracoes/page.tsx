import { createClient } from "@/lib/supabase/server";
import type { CanalVenda, FormaPagamento } from "@/types/domain";
import { ListaSimples } from "./lista-simples";
import { criarCanal, excluirCanal, criarFormaPagamento, excluirFormaPagamento } from "./actions";
import { NotificacoesConfig } from "./notificacoes-config";

export default async function ConfiguracoesPage() {
  const supabase = await createClient();
  const [{ data: canais }, { data: formas }] = await Promise.all([
    supabase.from("canais_venda").select("*").order("nome"),
    supabase.from("formas_pagamento").select("*").order("nome"),
  ]);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-white">Configurações</h1>
        <p className="text-sm text-neutral-400">Canais de venda, formas de pagamento e notificações.</p>
      </div>

      <div className="flex flex-col gap-6">
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
