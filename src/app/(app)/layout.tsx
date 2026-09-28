import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/sign-out-button";

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/produtos", label: "Produtos" },
  { href: "/fluxo-de-caixa", label: "Fluxo de caixa" },
];

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const nomeNegocio = (user.user_metadata?.nome_negocio as string | undefined) ?? user.email;

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 shrink-0 flex-col border-r border-neutral-800 bg-neutral-900 px-3 py-4">
        <div className="mb-6 px-2">
          <p className="text-sm font-semibold text-white">{nomeNegocio}</p>
          <p className="text-xs text-neutral-500">{user.email}</p>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-lg px-3 py-2 text-sm text-neutral-300 transition hover:bg-neutral-800 hover:text-white"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <SignOutButton />
      </aside>
      <main className="flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  );
}
