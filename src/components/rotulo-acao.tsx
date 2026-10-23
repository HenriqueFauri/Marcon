import type { ReactNode } from "react";
import { Spinner } from "./seta-link";

// Texto de botão que vira "Salvando..." com spinner enquanto a ação roda, sem mexer na largura:
// os dois textos ficam sempre na mesma célula e o botão ocupa o maior, só um aparece.
export function RotuloAcao({ pendente, ocupado, children }: { pendente: boolean; ocupado: string; children: ReactNode }) {
  return (
    <span className="inline-grid">
      <span aria-hidden={pendente} className={`col-start-1 row-start-1 inline-flex items-center justify-center gap-1.5 ${pendente ? "invisible" : ""}`}>
        {children}
      </span>
      <span aria-hidden={!pendente} className={`col-start-1 row-start-1 inline-flex items-center justify-center gap-1.5 ${pendente ? "" : "invisible"}`}>
        <Spinner />
        {ocupado}
      </span>
    </span>
  );
}
