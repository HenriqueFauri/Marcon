import type { SVGProps } from "react";

// Ícones de traço simples (estilo Lucide), desenhados inline pra não puxar dependência.
function Icon({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      width={18}
      height={18}
      {...props}
    >
      {children}
    </svg>
  );
}

type P = SVGProps<SVGSVGElement>;

export const IconHome = (p: P) => (
  <Icon {...p}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V21h14V9.5" />
    <path d="M10 21v-6h4v6" />
  </Icon>
);
export const IconShield = (p: P) => (
  <Icon {...p}>
    <path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.4 7.5 9.5 4.3-1.1 7.5-4.9 7.5-9.5V6L12 3Z" />
    <path d="m9 12 2 2 4-4" />
  </Icon>
);
export const IconBox = (p: P) => (
  <Icon {...p}>
    <path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" />
    <path d="m3 8 9 5 9-5" />
    <path d="M12 13v8" />
  </Icon>
);
export const IconCart = (p: P) => (
  <Icon {...p}>
    <circle cx="9" cy="20" r="1.3" />
    <circle cx="18" cy="20" r="1.3" />
    <path d="M2 3h3l2.6 12.4a1.5 1.5 0 0 0 1.5 1.1h8.8a1.5 1.5 0 0 0 1.5-1.2L21 8H6" />
  </Icon>
);
export const IconUsers = (p: P) => (
  <Icon {...p}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
    <path d="M16 4.5a3.5 3.5 0 0 1 0 7" />
    <path d="M18.5 14.5A6.5 6.5 0 0 1 21.5 20" />
  </Icon>
);
export const IconTruck = (p: P) => (
  <Icon {...p}>
    <path d="M2 6h12v10H2z" />
    <path d="M14 10h4l4 3v3h-8" />
    <circle cx="6" cy="18" r="2" />
    <circle cx="18" cy="18" r="2" />
  </Icon>
);
export const IconReceipt = (p: P) => (
  <Icon {...p}>
    <path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2V3Z" />
    <path d="M9 8h6M9 12h6" />
  </Icon>
);
export const IconWallet = (p: P) => (
  <Icon {...p}>
    <path d="M3 7a2 2 0 0 1 2-2h13v4" />
    <path d="M3 7v11a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2Z" />
    <circle cx="16" cy="14.5" r="1.2" />
  </Icon>
);
export const IconSettings = (p: P) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
  </Icon>
);
export const IconMenu = (p: P) => (
  <Icon {...p}>
    <path d="M4 6h16M4 12h16M4 18h16" />
  </Icon>
);
export const IconX = (p: P) => (
  <Icon {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Icon>
);
export const IconPlus = (p: P) => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);
export const IconMinus = (p: P) => (
  <Icon {...p}>
    <path d="M5 12h14" />
  </Icon>
);
export const IconSearch = (p: P) => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </Icon>
);
export const IconChevronLeft = (p: P) => (
  <Icon {...p}>
    <path d="m15 18-6-6 6-6" />
  </Icon>
);
export const IconChevronRight = (p: P) => (
  <Icon {...p}>
    <path d="m9 18 6-6-6-6" />
  </Icon>
);
export const IconTrash = (p: P) => (
  <Icon {...p}>
    <path d="M4 7h16M10 11v6M14 11v6" />
    <path d="M6 7l1 13h10l1-13M9 7V4h6v3" />
  </Icon>
);
export const IconPencil = (p: P) => (
  <Icon {...p}>
    <path d="M4 20h4L19 9l-4-4L4 16v4Z" />
    <path d="m13.5 6.5 4 4" />
  </Icon>
);
export const IconLogout = (p: P) => (
  <Icon {...p}>
    <path d="M15 4h4v16h-4" />
    <path d="M10 8l-4 4 4 4M6 12h10" />
  </Icon>
);
export const IconMegaphone = (p: P) => (
  <Icon {...p}>
    <path d="M3 10v4a1 1 0 0 0 1 1h3l8 4V5L7 9H4a1 1 0 0 0-1 1Z" />
    <path d="M18.5 9a4 4 0 0 1 0 6" />
  </Icon>
);
export const IconAlert = (p: P) => (
  <Icon {...p}>
    <path d="M12 3 2 20h20L12 3Z" />
    <path d="M12 10v4M12 17h.01" />
  </Icon>
);
export const IconCheck = (p: P) => (
  <Icon {...p}>
    <path d="m5 12 5 5L20 7" />
  </Icon>
);
export const IconWhatsapp = (p: P) => (
  <Icon {...p}>
    <path d="M3.5 20.5 5 16a8.5 8.5 0 1 1 3.2 3.1L3.5 20.5Z" />
    <path d="M9 9.5c.3 2 2.5 4.2 4.5 4.5l1.2-1.1 1.8.9-.4 1.6c-3 .5-7.6-4-7.1-7.1l1.6-.4.9 1.8L9 9.5Z" />
  </Icon>
);
export const IconSun = (p: P) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Icon>
);
export const IconMoon = (p: P) => (
  <Icon {...p}>
    <path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z" />
  </Icon>
);
export const IconChevronDown = (p: P) => (
  <Icon {...p}>
    <path d="m6 9 6 6 6-6" />
  </Icon>
);
export const IconSparkles = (p: P) => (
  <Icon {...p}>
    <path d="M12 3.5 13.6 8.4 18.5 10 13.6 11.6 12 16.5 10.4 11.6 5.5 10 10.4 8.4Z" />
    <path d="M18.5 15.5v4M16.5 17.5h4" />
  </Icon>
);
export const IconLink = (p: P) => (
  <Icon {...p}>
    <path d="M10 13.5a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.2 1.2" />
    <path d="M14 10.5a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.2-1.2" />
  </Icon>
);
export const IconGrid = (p: P) => (
  <Icon {...p}>
    <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" />
    <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
    <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" />
    <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" />
  </Icon>
);
export const IconList = (p: P) => (
  <Icon {...p}>
    <path d="M9 6.5h11M9 12h11M9 17.5h11" />
    <path d="M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01" strokeWidth={2.6} />
  </Icon>
);
export const IconGift = (p: P) => (
  <Icon {...p}>
    <rect x="3.5" y="8.5" width="17" height="4" rx="1" />
    <path d="M5 12.5V19a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19v-6.5" />
    <path d="M12 8.5v12" />
    <path d="M12 8.5c-1.2-3.6-5-3.6-5-1.2 0 1.2 1.3 1.2 2.4 1.2H12Zm0 0c1.2-3.6 5-3.6 5-1.2 0 1.2-1.3 1.2-2.4 1.2H12Z" />
  </Icon>
);
