import { notFound } from "next/navigation";
import { Landing, metadataDo } from "@/app/landing/landing";

// Versão alternativa da landing geral, que também apresenta o assistente no WhatsApp: /assistente.
// Desligada até o assistente abrir para clientes (WHATSAPP_LANDING=1). O texto trata o assistente
// como "em breve, num plano maior": ninguém pode assinar o plano Marcon esperando por ele.
export const metadata = metadataDo("assistente");

export default function LandingAssistente() {
  if (process.env.WHATSAPP_LANDING !== "1") notFound();
  return <Landing publico="assistente" />;
}
