import Link from "next/link";
import { IconAlert } from "@/components/icons";
import { btnPrimary } from "@/components/ui";

// Aviso de que o plano grátis está acabando (faixa) ou acabou (bloqueio com saída).
// O banco é quem barra; isto só explica antes de a pessoa esbarrar num erro.

export function AvisoDeLimite({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-warning-tint px-4 py-3 text-[14px] text-warning">
      <span className="flex items-center gap-2">
        <IconAlert width={16} height={16} className="shrink-0" />
        {children}
      </span>
      <Link href="/assinatura" className="font-medium underline-offset-2 hover:underline">
        Ver planos
      </Link>
    </div>
  );
}

export function LimiteAtingido({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="hairline flex flex-col items-center gap-2 rounded-3xl bg-surface px-6 py-14 text-center">
      <p className="text-[17px] font-semibold text-ink">{titulo}</p>
      <p className="max-w-sm text-[15px] text-ink-muted">{texto}</p>
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        <Link href="/assinatura" className={btnPrimary}>
          Assinar o plano Marcon
        </Link>
      </div>
    </div>
  );
}
