import { notFound } from "next/navigation";
import { Landing, metadataDo } from "@/app/landing/landing";

// Versão alternativa da landing geral, que também apresenta o assistente no WhatsApp: /assistente.
// Desligada até o assistente abrir para clientes (WHATSAPP_LANDING=1): ela promete o assistente no
// plano Marcon, e ninguém pode assinar esperando algo que ainda não tem.
export const metadata = metadataDo("assistente");

export default function LandingAssistente() {
  if (process.env.WHATSAPP_LANDING !== "1") notFound();
  return <Landing publico="assistente" />;
}
