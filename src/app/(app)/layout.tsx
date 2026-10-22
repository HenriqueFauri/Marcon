import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MobileNav, Sidebar } from "@/components/app-nav";
import { ToastProvider } from "@/components/toaster";
import { AvisoCortesia } from "@/components/aviso-cortesia";
import { AvisoOffline } from "@/components/aviso-offline";
import { rotuloDaSituacao, situacaoDaAssinatura } from "@/lib/assinatura";
import { adminConfirmado } from "@/lib/admin";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [{ count: parcelasAbertas }, { count: pedidosNovos }, { data: assinaturaRow }] = await Promise.all([
    supabase.from("parcelas_com_status").select("id", { count: "exact", head: true }).neq("status", "pago"),
    supabase.from("vitrine_pedidos").select("id", { count: "exact", head: true }).eq("status", "novo"),
    supabase.from("assinaturas").select("plano, status, proximo_vencimento, cortesia_ate, cortesia_em").maybeSingle(),
  ]);
  const situacao = situacaoDaAssinatura(assinaturaRow, user.created_at);
  const plano = rotuloDaSituacao(situacao);
  const contagens = { "/contas-a-receber": parcelasAbertas ?? 0, "/vitrine": pedidosNovos ?? 0 };
  const admin = await adminConfirmado(user);

  const nomeNegocio = (user.user_metadata?.nome_negocio as string | undefined) || "Meu negócio";
  const nome =
    (user.user_metadata?.nome as string | undefined) ??
    (user.user_metadata?.full_name as string | undefined) ??
    (user.user_metadata?.name as string | undefined) ??
    user.email ??
    "";

  return (
    <ToastProvider>
      <AvisoOffline />
      <div data-clarity-mask="true" className="flex min-h-dvh">
        <Sidebar nomeNegocio={nomeNegocio} nome={nome} contagens={contagens} plano={plano} admin={admin} />
        <div className="flex min-w-0 flex-1 flex-col">
          <MobileNav nomeNegocio={nomeNegocio} nome={nome} contagens={contagens} plano={plano} admin={admin} />
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-5 sm:px-6 lg:pb-10 lg:pt-8">
            <AvisoCortesia situacao={situacao} />
            {children}
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
