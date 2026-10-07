import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { lerUso } from "@/lib/uso";
import { Importador } from "./importador";

export const metadata: Metadata = { title: "Importar dados" };

export default async function ImportarPage() {
  // plano grátis: só produtos. O banco recusa vendas e extrato; a tela explica antes
  const uso = await lerUso(await createClient());
  const historicoLiberado = uso ? uso.limites.importaHistorico : true;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Importar dados"
      />
      <Importador historicoLiberado={historicoLiberado} />
    </div>
  );
}
