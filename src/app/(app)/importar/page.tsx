import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { Importador } from "./importador";

export const metadata: Metadata = { title: "Importar dados" };

export default function ImportarPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Importar dados"
        description="Traga seus produtos, vendas e caixa de outro sistema. Você confere tudo antes de entrar."
      />
      <Importador />
    </div>
  );
}
