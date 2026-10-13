import { Landing, metadataDo } from "@/app/landing/landing";

// Versão alternativa da landing geral, que também apresenta o assistente no WhatsApp: /assistente
export const metadata = metadataDo("assistente");

export default function LandingAssistente() {
  return <Landing publico="assistente" />;
}
