"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ComponentType, type SVGProps } from "react";
import {
  IconBox,
  IconCart,
  IconGift,
  IconHome,
  IconMegaphone,
  IconPlus,
  IconSearch,
  IconReceipt,
  IconSettings,
  IconShield,
  IconTruck,
  IconUsers,
  IconWallet,
  IconX,
} from "./icons";
import { Badge } from "./ui";
import { SignOutButton } from "./sign-out-button";
import { ThemeToggle } from "./theme-toggle";

interface NavItem {
  href: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}

const NAV: NavItem[] = [
  { href: "/", label: "Início", icon: IconHome },
  { href: "/vendas", label: "Vendas", icon: IconCart },
  { href: "/produtos", label: "Produtos", icon: IconBox },
  { href: "/anuncios", label: "Anúncios", icon: IconMegaphone },
  { href: "/contas-a-receber", label: "Contas a receber", icon: IconReceipt },
  { href: "/fluxo-de-caixa", label: "Fluxo de caixa", icon: IconWallet },
  { href: "/clientes", label: "Clientes", icon: IconUsers },
  { href: "/fornecedores", label: "Fornecedores", icon: IconTruck },
  { href: "/indique", label: "Indique e ganhe", icon: IconGift },
  { href: "/configuracoes", label: "Configurações", icon: IconSettings },
  // só aparece para admin (ADMIN_EMAILS)
  { href: "/admin", label: "Administração", icon: IconShield },
];

// atalhos da barra inferior no celular; o resto fica no menu
const NAV_MOBILE = ["/", "/vendas", "/produtos", "/clientes"];

// no desktop o menu se divide em grupos, como na barra lateral do Mac
const GRUPOS: { titulo: string | null; hrefs: string[] }[] = [
  { titulo: "Loja", hrefs: ["/", "/vendas", "/produtos", "/anuncios", "/fornecedores"] },
  { titulo: "Dinheiro", hrefs: ["/contas-a-receber", "/fluxo-de-caixa", "/clientes"] },
  { titulo: null, hrefs: ["/indique", "/configuracoes"] },
];

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

type Contagens = Record<string, number>;

export interface PlanoNav {
  texto: string;
  tom: "neutral" | "positive" | "warning" | "info";
}

// estado da assinatura sempre à vista: avisa o fim do teste sem invadir as telas de trabalho
function PlanoLink({ plano, pathname, onNavigate }: { plano: PlanoNav; pathname: string; onNavigate?: () => void }) {
  const isAtivo = pathname === "/assinatura";
  return (
    <Link
      href="/assinatura"
      onClick={onNavigate}
      aria-current={isAtivo ? "page" : undefined}
      className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-[13px] transition ${
        isAtivo ? "border-brand bg-brand-tint" : "border-line hover:bg-fill"
      }`}
    >
      <span className="text-ink-muted">Seu plano</span>
      <Badge tone={plano.tom}>{plano.texto}</Badge>
    </Link>
  );
}

function ItemNav({ item, pathname, onNavigate, contagem }: { item: NavItem; pathname: string; onNavigate?: () => void; contagem?: number }) {
  const isAtivo = ativo(pathname, item.href);
  const Icone = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={isAtivo ? "page" : undefined}
      className={`flex items-center gap-3 rounded-xl px-3 py-2 text-[15px] transition ${
        isAtivo ? "bg-brand-tint font-medium text-brand-text" : "text-ink-2 hover:bg-fill hover:text-ink"
      }`}
    >
      <Icone className={isAtivo ? "" : "text-brand-text"} />
      <span className="flex-1">{item.label}</span>
      {contagem ? <span className="text-xs tabular-nums text-ink-muted">{contagem}</span> : null}
    </Link>
  );
}

function ListaNav({
  pathname,
  onNavigate,
  contagens,
  admin,
}: {
  pathname: string;
  onNavigate?: () => void;
  contagens?: Contagens;
  admin?: boolean;
}) {
  const porHref = new Map(NAV.map((i) => [i.href, i]));
  return (
    <nav className="flex flex-col gap-4" aria-label="Menu principal">
      {GRUPOS.map((g, idx) => (
        <div key={idx} className="flex flex-col gap-0.5">
          {g.titulo && <p className="px-3 pb-1 text-xs font-semibold text-ink-muted">{g.titulo}</p>}
          {(g.titulo === null && admin ? [...g.hrefs, "/admin"] : g.hrefs).map((h) => (
            <ItemNav key={h} item={porHref.get(h)!} pathname={pathname} onNavigate={onNavigate} contagem={contagens?.[h]} />
          ))}
        </div>
      ))}
    </nav>
  );
}

export function Sidebar({
  nomeNegocio,
  nome,
  contagens,
  plano,
  admin,
}: {
  nomeNegocio: string;
  nome: string;
  contagens?: Contagens;
  plano: PlanoNav;
  admin?: boolean;
}) {
  const pathname = usePathname();
  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-line bg-surface/60 px-3 py-5 lg:flex">
      <div className="mb-6 px-2">
        <Marca nomeNegocio={nomeNegocio} nome={nome} />
      </div>
      <div className="flex-1 overflow-y-auto">
        <ListaNav pathname={pathname} contagens={contagens} admin={admin} />
      </div>
      <div className="mt-3">
        <PlanoLink plano={plano} pathname={pathname} />
      </div>
      <div className="mt-3 px-1">
        <ThemeToggle />
      </div>
      <SignOutButton />
    </aside>
  );
}

export function MobileNav({
  nomeNegocio,
  nome,
  contagens,
  plano,
  admin,
}: {
  nomeNegocio: string;
  nome: string;
  contagens?: Contagens;
  plano: PlanoNav;
  admin?: boolean;
}) {
  const pathname = usePathname();
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (aberto && !dialog.open) dialog.showModal();
    if (!aberto && dialog.open) dialog.close();
  }, [aberto]);

  // a tela de nova venda ocupa o celular inteiro, sem abas nem cabeçalho
  const emVenda = pathname.startsWith("/vendas/novo");
  const atalhos = NAV.filter((i) => NAV_MOBILE.includes(i.href));

  return (
    <>
      <header className={`sticky top-0 z-30 ${emVenda ? "hidden" : "flex"} items-center justify-end gap-2.5 px-4 pb-1 pt-[max(0.75rem,env(safe-area-inset-top))] lg:hidden`}>
        <Link
          href="/produtos?buscar=1"
          aria-label="Buscar produtos"
          className="glass flex h-11 w-11 items-center justify-center rounded-full text-ink shadow-sm ring-1 ring-line/60"
        >
          <IconSearch width={20} height={20} strokeWidth={2.2} />
        </Link>
        <button
          onClick={() => setAberto(true)}
          aria-label="Abrir menu"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-fill text-[15px] font-semibold text-ink-muted"
        >
          {(nome || nomeNegocio).trim().charAt(0).toUpperCase() || "M"}
        </button>
      </header>

      <nav
        aria-label="Atalhos"
        className={`glass fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-4 right-[5.25rem] z-40 ${emVenda ? "hidden" : "grid"} grid-cols-4 items-center rounded-full p-1 shadow-lg shadow-black/15 ring-1 ring-line/60 lg:hidden`}
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
                isAtivo ? "bg-tab-active font-semibold text-brand-text" : "text-tab-ink"
              }`}
            >
              <Icone width={22} height={22} />
              <span className="max-w-full truncate px-1">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {!emVenda && (
        <Link
          href="/vendas/novo"
          aria-label="Nova venda"
          className="bg-brand-fill fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-4 z-40 flex h-[60px] w-[60px] items-center justify-center rounded-full text-on-brand shadow-lg shadow-brand/35 transition active:scale-95 lg:hidden"
        >
          <IconPlus width={26} height={26} strokeWidth={2.4} />
        </Link>
      )}

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
          <ListaNav pathname={pathname} onNavigate={() => setAberto(false)} contagens={contagens} admin={admin} />
          <PlanoLink plano={plano} pathname={pathname} onNavigate={() => setAberto(false)} />
          <ThemeToggle />
          <SignOutButton />
        </div>
      </dialog>
    </>
  );
}
