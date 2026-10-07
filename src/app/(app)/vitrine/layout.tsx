import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { lerUso } from "@/lib/uso";
import { Badge, Card, PageHeader, btnPrimary, btnSecondary } from "@/components/ui";
import { AbasVitrine } from "./abas";

// Menu Vitrine dividido em subpáginas (visão geral, produtos, personalizar, configurações, cupons).
// O plano é conferido aqui uma vez: no grátis, nenhuma subpágina abre, só o convite para assinar.
export default async function VitrineLayout({ children }: LayoutProps<"/vitrine">) {
  const supabase = await createClient();
  const [uso, { data: vitrine }] = await Promise.all([
    lerUso(supabase),
    supabase.from("vitrines").select("slug, ativa").maybeSingle(),
  ]);
  const temPlano = uso ? uso.plano !== "gratis" : true;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            Vitrine
            {temPlano &&
              (vitrine ? (
                <Badge tone={vitrine.ativa ? "positive" : "neutral"}>{vitrine.ativa ? "No ar" : "Desligada"}</Badge>
              ) : (
                <Badge tone="info">Não criada</Badge>
              ))}
          </span>
        }
        description="Sua loja online com link: o cliente escolhe os produtos e o pedido chega pronto no seu WhatsApp."
        action={
          temPlano && vitrine?.ativa ? (
            <a href={`/loja/${vitrine.slug}`} target="_blank" rel="noopener noreferrer" className={`${btnSecondary} px-4 py-2 text-sm`}>
              Ver loja
            </a>
          ) : undefined
        }
      />
      {temPlano ? (
        <>
          <AbasVitrine />
          {children}
        </>
      ) : (
        <Card>
          <div className="flex flex-col items-start gap-3">
            <p className="text-[15px] font-semibold text-ink">A vitrine faz parte do plano Marcon.</p>
            <p className="text-sm text-ink-2">
              Com ela você manda um link só no status e nos grupos, o cliente vê fotos e preços, monta o pedido e ele chega pronto
              no seu WhatsApp. Sem precisar responder &quot;ainda tem?&quot; um por um.
            </p>
            {vitrine && <p className="text-xs text-ink-muted">Sua loja e as escolhas de produtos continuam guardadas e voltam ao assinar.</p>}
            <Link href="/assinatura" className={`${btnPrimary} mt-1`}>
              Ver o plano Marcon
            </Link>
          </div>
        </Card>
      )}
    </div>
  );
}
