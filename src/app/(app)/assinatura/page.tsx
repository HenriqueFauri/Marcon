import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { asaasConfigurado } from "@/lib/asaas";
import { situacaoDaAssinatura } from "@/lib/assinatura";
import { AssinaturaPainel } from "./assinatura-painel";

export const metadata: Metadata = { title: "Assinatura" };

export default async function AssinaturaPage({ searchParams }: PageProps<"/assinatura">) {
  const sp = await searchParams;
  const supabase = await createClient();
  const [
    {
      data: { user },
    },
    { data: linha },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("assinaturas").select("plano, status, proximo_vencimento").maybeSingle(),
  ]);

  const situacao = situacaoDaAssinatura(linha, user?.created_at ?? new Date());

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Assinatura" description="Seu plano do Marcon. A cobrança é feita pelo Asaas." />
      <AssinaturaPainel
        situacao={situacao}
        cobrancaDisponivel={asaasConfigurado()}
        voltouDoPagamento={sp.assinatura === "ok"}
      />
    </div>
  );
}
