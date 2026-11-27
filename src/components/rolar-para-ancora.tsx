"use client";

import { useEffect } from "react";

// O Next rola até o #id quando o loading.tsx aparece, não acha o alvo e desiste.
// Este componente rola de novo quando a página de verdade chega.
export function RolarParaAncora() {
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (id) document.getElementById(id)?.scrollIntoView();
  }, []);
  return null;
}
