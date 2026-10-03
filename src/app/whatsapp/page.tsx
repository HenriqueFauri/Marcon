import { Landing, metadataDo } from "@/app/landing/landing";

// Link para mandar nos grupos de quem vende no WhatsApp: /whatsapp
export const metadata = metadataDo("whatsapp");

export default function LandingWhatsapp() {
  return <Landing publico="whatsapp" />;
}
