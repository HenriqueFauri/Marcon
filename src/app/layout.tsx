import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@/components/analytics";
import { ServiceWorkerRegistration } from "@/components/service-worker-registration";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "Marcon", template: "%s · Marcon" },
  description: "Anúncios, vendas, estoque e lucro para quem vende no Marketplace.",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Marcon" },
};

export const viewport: Viewport = {
  themeColor: "#f2f2f7",
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* aplica o tema escuro guardado antes da primeira pintura, pra não piscar */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem("marcon-tema")==="dark"){document.documentElement.setAttribute("data-theme","dark");var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content","#000000")}}catch(e){}`,
          }}
        />
      </head>
      <body className="flex min-h-full flex-col bg-canvas font-sans text-ink">
        <ServiceWorkerRegistration />
        <Analytics />
        {children}
      </body>
    </html>
  );
}
