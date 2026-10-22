"use client";

import { useSyncExternalStore } from "react";

// Sem internet o app instalado abre normal, mas o que o vendedor lança não salva. Este aviso
// aparece enquanto o aparelho estiver offline e some sozinho quando a conexão volta.
function assinar(aoMudar: () => void) {
  window.addEventListener("online", aoMudar);
  window.addEventListener("offline", aoMudar);
  return () => {
    window.removeEventListener("online", aoMudar);
    window.removeEventListener("offline", aoMudar);
  };
}

export function AvisoOffline() {
  const online = useSyncExternalStore(
    assinar,
    () => navigator.onLine,
    () => true,
  );
  if (online) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-[max(env(safe-area-inset-top),0.5rem)]"
    >
      <p className="hairline rounded-full bg-warning-tint px-4 py-2 text-[13px] font-medium text-ink shadow-sm">
        Sem internet. O que você lançar agora pode não salvar.
      </p>
    </div>
  );
}
