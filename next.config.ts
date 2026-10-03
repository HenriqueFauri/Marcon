import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // links antigos das landings por canal
  async redirects() {
    return [{ source: "/para/:canal(marketplace|whatsapp)", destination: "/:canal", permanent: false }];
  },
};

export default nextConfig;
