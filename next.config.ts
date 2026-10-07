import type { NextConfig } from "next";

// Content-Security-Policy em modo "só relata" (Report-Only): o navegador avisa no console o que
// seria bloqueado, mas não bloqueia nada. Depois de uns dias sem aviso relevante nas telas
// principais (login, painel, loja, recibo), trocar para "Content-Security-Policy" para valer.
// 'unsafe-inline' fica por causa do script do tema escuro no layout e dos scripts do next/script;
// 'unsafe-eval' só em desenvolvimento (o Next precisa dele no modo dev).
const dev = process.env.NODE_ENV !== "production";
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""} https://www.googletagmanager.com https://www.clarity.ms https://scripts.clarity.ms`,
  "style-src 'self' 'unsafe-inline'",
  // fotos e logos vêm de links assinados do Supabase Storage
  "img-src 'self' data: blob: https://*.supabase.co https://www.google-analytics.com https://*.googletagmanager.com https://*.clarity.ms https://c.bing.com",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com https://*.clarity.ms https://c.bing.com",
  "worker-src 'self'",
  "manifest-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const nextConfig: NextConfig = {
  // links antigos das landings por canal
  async redirects() {
    return [{ source: "/para/:canal(marketplace|whatsapp)", destination: "/:canal", permanent: false }];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy-Report-Only", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
