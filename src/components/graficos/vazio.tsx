import type { ReactNode } from "react";
import { EmptyState } from "@/components/ui";

// Obsoleto: use EmptyState (src/components/ui.tsx) com ilustracao="grafico".
// Fica só para não quebrar quem ainda importa daqui; nenhuma tela do app usa mais.
export function EstadoVazio({ titulo, texto, acoes }: { titulo: string; texto: string; acoes?: ReactNode }) {
  return <EmptyState ilustracao="grafico" title={titulo} description={texto} action={acoes} />;
}
