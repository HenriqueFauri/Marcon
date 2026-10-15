"use client";

import { useRouter } from "next/navigation";
import { ConfirmButton } from "@/components/confirm-button";
import { useAction } from "@/components/use-action";
import { bloquearConta } from "./actions";

// Bloquear e desbloquear uma conta. A cortesia tem a própria tela (cortesia-da-conta.tsx).
export function AcoesConta({ id, email, bloqueada }: { id: string; email: string; bloqueada: boolean }) {
  const router = useRouter();
  const { isPending, run } = useAction();

  return bloqueada ? (
    <button
      type="button"
      className="py-1 text-[15px] font-medium text-brand-text hover:underline disabled:opacity-50"
      disabled={isPending}
      onClick={() => run(() => bloquearConta(id, false), { onSuccess: () => router.refresh() })}
    >
      Desbloquear a conta
    </button>
  ) : (
    <ConfirmButton
      title="Bloquear esta conta?"
      description={`${email} não vai conseguir entrar. Nada é apagado, e você pode desbloquear depois.`}
      confirmLabel="Bloquear"
      onConfirm={() => bloquearConta(id, true)}
      onDone={() => router.refresh()}
      className="py-1 text-[15px] font-medium text-danger hover:underline"
    >
      Bloquear a conta
    </ConfirmButton>
  );
}
