"use client";

import { useRouter } from "next/navigation";
import { ConfirmButton } from "@/components/confirm-button";
import { useAction } from "@/components/use-action";
import { bloquearConta, definirCortesia } from "./actions";

const link = "whitespace-nowrap text-[13px] font-medium text-brand-text hover:underline disabled:opacity-50";

export function AcoesConta({
  id,
  email,
  bloqueada,
  cortesia,
  pagante,
}: {
  id: string;
  email: string;
  bloqueada: boolean;
  cortesia: boolean;
  pagante: boolean;
}) {
  const router = useRouter();
  const { isPending, run } = useAction();

  return (
    <div className="flex items-center justify-end gap-4">
      {!pagante && (
        <button
          type="button"
          className={link}
          disabled={isPending}
          onClick={() => run(() => definirCortesia(id, !cortesia), { onSuccess: () => router.refresh() })}
        >
          {cortesia ? "Tirar cortesia" : "Dar cortesia"}
        </button>
      )}
      {bloqueada ? (
        <button
          type="button"
          className={link}
          disabled={isPending}
          onClick={() => run(() => bloquearConta(id, false), { onSuccess: () => router.refresh() })}
        >
          Desbloquear
        </button>
      ) : (
        <ConfirmButton
          title="Bloquear esta conta?"
          description={`${email} não vai conseguir entrar. Nada é apagado, e você pode desbloquear depois.`}
          confirmLabel="Bloquear"
          onConfirm={() => bloquearConta(id, true)}
          onDone={() => router.refresh()}
          className="whitespace-nowrap text-[13px] font-medium text-ink-muted hover:text-danger hover:underline"
        >
          Bloquear
        </ConfirmButton>
      )}
    </div>
  );
}
