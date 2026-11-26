import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { BoasVindasForm } from "./boas-vindas-form";
import { contaRecente } from "@/lib/origem-servidor";

export const metadata: Metadata = { title: "Boas-vindas" };

export default async function BoasVindasPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const nomeNegocio = (user?.user_metadata?.nome_negocio as string | undefined) ?? "";

  return (
    <div className="mx-auto w-full max-w-md">
      <PageHeader title="Boas-vindas ao Marcon" />
      <BoasVindasForm nomeNegocio={nomeNegocio} perguntarOrigem={!!user && contaRecente(user)} />
    </div>
  );
}
