"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ComponentType, type SVGProps } from "react";
import {
  IconBox,
  IconCart,
  IconHome,
  IconMenu,
  IconReceipt,
  IconSettings,
  IconTruck,
  IconUsers,
  IconWallet,
  IconX,
} from "./icons";
import { SignOutButton } from "./sign-out-button";

interface NavItem {
  href: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}

const NAV: NavItem[] = [
  { href: "/", label: "Início", icon: IconHome },
  { href: "/vendas", label: "Vendas", icon: IconCart },
  { href: "/produtos", label: "Produtos", icon: IconBox },
  { href: "/contas-a-receber", label: "Contas a receber", icon: IconReceipt },
  { href: "/fluxo-de-caixa", label: "Fluxo de caixa", icon: IconWallet },
  { href: "/clientes", label: "Clientes", icon: IconUsers },
  { href: "/fornecedores", label: "Fornecedores", icon: IconTruck },
  { href: "/configuracoes", label: "Configurações", icon: IconSettings },
];

// atalhos da barra inferior no celular; o resto fica no menu
const NAV_MOBILE = ["/", "/vendas", "/produtos", "/contas-a-receber"];

function ativo(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
}

function Marca({ nomeNegocio, nome }: { nomeNegocio: string; nome: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-brand-fill text-sm font-bold text-on-brand">
        {nomeNegocio.trim().charAt(0).toUpperCase() || "G"}
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-ink">{nomeNegocio}</p>
        <p className="truncate text-xs text-ink-muted">{nome}</p>
      </div>
    </div>
  );
}

function ListaNav({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-0.5" aria-label="Menu principal">
      {NAV.map((item) => {
        const isAtivo = ativo(pathname, item.href);
        const Icone = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={isAtivo ? "page" : undefined}
            className={`flex items-center gap-3 rounded-xl px-3 py-2 text-[15px] transition ${
              isAtivo
                ? "bg-brand-tint font-medium text-brand-text"
                : "text-ink-2 hover:bg-fill hover:text-ink"
            }`}
          >
            <Icone />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function Sidebar({ nomeNegocio, nome }: { nomeNegocio: string; nome: string }) {
  const pathname = usePathname();
  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-line bg-surface/60 px-3 py-5 lg:flex">
      <div className="mb-6 px-2">
        <Marca nomeNegocio={nomeNegocio} nome={nome} />
      </div>
      <div className="flex-1 overflow-y-auto">
        <ListaNav pathname={pathname} />
      </div>
      <SignOutButton />
    </aside>
  );
}

export function MobileNav({ nomeNegocio, nome }: { nomeNegocio: string; nome: string }) {
  const pathname = usePathname();
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (aberto && !dialog.open) dialog.showModal();
    if (!aberto && dialog.open) dialog.close();
  }, [aberto]);

  const atalhos = NAV.filter((i) => NAV_MOBILE.includes(i.href));
  const menuAtivo = !atalhos.some((i) => ativo(pathname, i.href));

  return (
    <>
      <header className="glass sticky top-0 z-30 flex items-center justify-between border-b border-line/60 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] lg:hidden">
        <Marca nomeNegocio={nomeNegocio} nome={nome} />
      </header>

      <nav
        aria-label="Atalhos"
        className="glass fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 grid grid-cols-5 rounded-full p-1 shadow-lg shadow-black/15 ring-1 ring-line/60 lg:hidden"
      >
        {atalhos.map((item) => {
          const isAtivo = ativo(pathname, item.href);
          const Icone = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isAtivo ? "page" : undefined}
              className={`flex flex-col items-center gap-0.5 rounded-full py-2 text-[10px] font-medium ${
                isAtivo ? "bg-fill text-brand-text" : "text-ink-2"
              }`}
            >
              <Icone width={20} height={20} />
              <span className="max-w-full truncate px-1">
                {item.href === "/contas-a-receber" ? "A receber" : item.label}
              </span>
            </Link>
          );
        })}
        <button
          onClick={() => setAberto(true)}
          className={`flex flex-col items-center gap-0.5 rounded-full py-2 text-[10px] font-medium ${menuAtivo ? "bg-fill text-brand-text" : "text-ink-2"}`}
        >
          <IconMenu width={20} height={20} />
          Menu
        </button>
      </nav>

      <dialog
        ref={ref}
        onClose={() => setAberto(false)}
        onClick={(e) => {
          if (e.target === ref.current) setAberto(false);
        }}
        className="mb-0 mt-auto max-h-[85dvh] w-full max-w-none rounded-t-[28px] bg-surface p-0 text-ink backdrop:bg-black/40 backdrop:backdrop-blur-sm"
      >
        <div className="flex flex-col gap-4 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="flex items-center justify-between">
            <Marca nomeNegocio={nomeNegocio} nome={nome} />
            <button
              onClick={() => setAberto(false)}
              aria-label="Fechar menu"
              className="rounded-md p-1 text-ink-muted hover:bg-fill hover:text-ink"
            >
              <IconX />
            </button>
          </div>
          <ListaNav pathname={pathname} onNavigate={() => setAberto(false)} />
          <SignOutButton />
        </div>
      </dialog>
    </>
  );
}
