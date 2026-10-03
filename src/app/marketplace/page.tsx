import { Landing, metadataDo } from "@/app/landing/landing";

// Link para mandar nos grupos de quem vende no Marketplace: /marketplace
export const metadata = metadataDo("marketplace");

export default function LandingMarketplace() {
  return <Landing publico="marketplace" />;
}
