import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { enderecoDoApp } from "@/lib/indicacao-servidor";
import { ConfiguracaoForm } from "./configuracao-form";

export const metadata: Metadata = { title: "Vitrine | Configurações" };

export default async function VitrineConfiguracoesPage() {
  const supabase = await createClient();
  const [
    {
      data: { user },
    },
    { data: vitrine },
    base,
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("vitrines").select("slug, ativa, whatsapp, entrega, frete_fixo").maybeSingle(),
    enderecoDoApp(),
  ]);
  const meta = user?.user_metadata ?? {};

  return (
    <div className="flex flex-col gap-4">
        <ConfiguracaoForm
          config={
            vitrine
              ? {
                  slug: vitrine.slug,
                  ativa: vitrine.ativa,
                  whatsapp: vitrine.whatsapp,
                  entrega: vitrine.entrega,
                  freteFixo: vitrine.frete_fixo === null ? "" : String(vitrine.frete_fixo).replace(".", ","),
                }
              : null
          }
          nomeNegocio={(meta.nome_negocio as string | undefined) ?? ""}
          telefoneEmpresa={(meta.empresa_telefone as string | undefined) ?? ""}
          base={base}
        />
      <p className="px-4 text-[13px] text-ink-muted">
        As formas de pagamento que o cliente escolhe no pedido são as mesmas das vendas, em{" "}
        <Link href="/configuracoes" className="font-medium text-brand-text hover:underline">
          Configurações do app
        </Link>
        .
      </p>
    </div>
  );
}
