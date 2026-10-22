"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { BotaoLerCodigo } from "@/components/leitor-codigo";
import { btnSecondary } from "@/components/ui";

// Câmera na busca de produtos: o código lido vira o termo da busca (?q=), que também casa com o código de barras.
export function LerCodigoBusca() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <BotaoLerCodigo
      rotulo="Ler código"
      className={`${btnSecondary} min-h-11 shrink-0`}
      onCodigo={(codigo) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set("q", codigo);
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      }}
    />
  );
}
