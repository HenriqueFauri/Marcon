import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MobileNav, Sidebar } from "@/components/app-nav";
import { ToastProvider } from "@/components/toaster";
import { rotuloDaSituacao, situacaoDaAssinatura } from "@/lib/assinatura";
import { ehAdmin } from "@/lib/admin";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [{ count: parcelasAbertas }, { data: assinaturaRow }] = await Promise.all([
    supabase.from("parcelas_com_status").select("id", { count: "exact", head: true }).neq("status", "pago"),
    supabase.from("assinaturas").select("plano, status, proximo_vencimento").maybeSingle(),
  ]);
  const plano = rotuloDaSituacao(situacaoDaAssinatura(assinaturaRow, user.created_at));
  const contagens = { "/contas-a-receber": parcelasAbertas ?? 0 };
  const admin = ehAdmin(user);

  const nomeNegocio = (user.user_metadata?.nome_negocio as string | undefined) || "Meu negócio";
  const nome =
    (user.user_metadata?.nome as string | undefined) ??
    (user.user_metadata?.full_name as string | undefined) ??
    (user.user_metadata?.name as string | undefined) ??
    user.email ??
    "";

  return (
    <ToastProvider>
      <div data-clarity-mask="true" className="flex min-h-dvh">
        <Sidebar nomeNegocio={nomeNegocio} nome={nome} contagens={contagens} plano={plano} admin={admin} />
        <div className="flex min-w-0 flex-1 flex-col">
          <MobileNav nomeNegocio={nomeNegocio} nome={nome} contagens={contagens} plano={plano} admin={admin} />
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-5 sm:px-6 lg:pb-10 lg:pt-8">
            {children}
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
