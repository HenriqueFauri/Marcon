"use client";

import { useEffect, useState } from "react";
import { formatBRL } from "@/lib/format";

// Número que sobe de zero até o valor. Mostra sempre o valor inteiro (sem cortar) e fica parado
// para quem pede menos movimento.
export function Numero({ valor, tipo }: { valor: number; tipo: "brl" | "pct" | "int" }) {
  const [v, setV] = useState(valor);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const inicio = performance.now();
    const duracao = 800;
    const passo = (agora: number) => {
      const t = Math.min(1, (agora - inicio) / duracao);
      setV(valor * (1 - Math.pow(1 - t, 3)));
      if (t < 1) raf = requestAnimationFrame(passo);
    };
    raf = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(raf);
  }, [valor]);

  if (tipo === "brl") return <>{formatBRL(v)}</>;
  if (tipo === "pct") return <>{v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</>;
  return <>{Math.round(v).toLocaleString("pt-BR")}</>;
}
