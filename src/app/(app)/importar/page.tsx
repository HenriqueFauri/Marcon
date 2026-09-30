import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { lerUso, restante } from "@/lib/uso";
import { Importador } from "./importador";

export const metadata: Metadata = { title: "Importar dados" };

export default async function ImportarPage() {
  // plano grátis: só produtos, até o limite do plano. O banco recusa o resto; a tela explica antes
  const uso = await lerUso(await createClient());
  const historicoLiberado = uso ? uso.limites.importaHistorico : true;
  const produtosRestantes = uso ? restante(uso.produtos, uso.limites.produtos) : null;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Importar dados"
        description="Traga seus produtos, vendas e caixa de outro sistema. Você confere tudo antes de entrar."
      />
      <Importador historicoLiberado={historicoLiberado} produtosRestantes={produtosRestantes} />
    </div>
  );
}
