import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { lerUso } from "@/lib/uso";
import { Badge, Card, PageHeader, btnPrimary } from "@/components/ui";
import { CabecalhoVitrine } from "./abas";

// Menu Vitrine dividido em subpáginas (visão geral, produtos, personalizar, configurações, cupons).
// O plano é conferido aqui uma vez: no grátis, nenhuma subpágina abre, só o convite para assinar.
export default async function VitrineLayout({ children }: LayoutProps<"/vitrine">) {
  const supabase = await createClient();
  const [uso, { data: vitrine }] = await Promise.all([
    lerUso(supabase),
    supabase.from("vitrines").select("slug, ativa").maybeSingle(),
  ]);
  const temPlano = uso ? uso.plano !== "gratis" : true;

  if (!temPlano) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Vitrine" />
        <Card>
          <div className="flex flex-col items-start gap-3">
            <p className="text-[17px] font-semibold text-ink">Sua loja com link, no plano Marcon.</p>
            <p className="text-[15px] text-ink-2">
              Mande um link só no status e nos grupos. O cliente vê fotos e preços, monta o pedido e ele chega pronto no seu
              WhatsApp, sem responder &quot;ainda tem?&quot; um por um.
            </p>
            {vitrine && <p className="text-[13px] text-ink-muted">Sua loja e seus produtos continuam guardados e voltam ao assinar.</p>}
            <Link href="/assinatura" className={`${btnPrimary} mt-1`}>
              Ver o plano Marcon
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  const selo = vitrine ? (
    <Badge tone={vitrine.ativa ? "positive" : "neutral"}>{vitrine.ativa ? "No ar" : "Desligada"}</Badge>
  ) : (
    <Badge tone="info">Não criada</Badge>
  );

  return (
    <div className="mx-auto max-w-2xl">
      <CabecalhoVitrine selo={selo} />
      {children}
    </div>
  );
}
