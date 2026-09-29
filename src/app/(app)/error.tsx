"use client";

import { useEffect } from "react";
import { btnPrimary } from "@/components/ui";

export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-20 text-center">
      <h1 className="text-lg font-semibold text-ink">Não foi possível carregar esta página</h1>
      <p className="text-sm text-ink-muted">
        Pode ter sido uma falha de conexão. Seus dados estão seguros — tente de novo.
      </p>
      <button onClick={() => retry()} className={btnPrimary}>
        Tentar de novo
      </button>
    </div>
  );
}
