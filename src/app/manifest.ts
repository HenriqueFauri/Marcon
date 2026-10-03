import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Marcon",
    short_name: "Marcon",
    description: "O app de quem vende no Marketplace e no WhatsApp: estoque, custo, lucro e anúncios num lugar só.",
    start_url: "/",
    display: "standalone",
    background_color: "#f2f2f7",
    theme_color: "#d45f30",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
