"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Enquanto o pedido está em andamento, busca o andamento de novo a cada 30 segundos (só com a aba aberta).
export function AtualizaSozinho({ ativo }: { ativo: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!ativo) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 30000);
    return () => clearInterval(id);
  }, [ativo, router]);
  return null;
}
