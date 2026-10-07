import type { NextConfig } from "next";

// Content-Security-Policy: o navegador só carrega scripts, imagens e conexões das origens abaixo.
// Rodou em Report-Only e as telas principais (login, login com Google, painel, loja, recibo) não
// geraram nenhum aviso, então agora vale de verdade. Se uma tela nova carregar algo de fora e
// quebrar, o console mostra "Refused to ..." com o endereço a incluir na lista.
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
  // o Clarity pode criar um worker a partir de um blob
  "worker-src 'self' blob:",
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
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      // a prévia da loja abre num iframe de Personalizar: só o próprio app pode emoldurar
      // (a regra de baixo sobrescreve a de cima nas duas chaves)
      {
        source: "/previa-da-loja",
        headers: [
          { key: "Content-Security-Policy", value: csp.replace("frame-ancestors 'none'", "frame-ancestors 'self'") },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
    ];
  },
};

export default nextConfig;
