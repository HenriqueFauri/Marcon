"use client";

import { useRouter } from "next/navigation";
import { ConfirmButton } from "@/components/confirm-button";
import { useAction } from "@/components/use-action";
import { useToast } from "@/components/toaster";
import { formatBRL } from "@/lib/format";
import { marcarSaquePago, recusarSaque } from "../actions";

const link = "whitespace-nowrap text-[13px] font-medium text-brand-text hover:underline disabled:opacity-50";

export function AcoesSaque({ id, valor, chavePix }: { id: string; valor: number; chavePix: string }) {
  const router = useRouter();
  const toast = useToast();
  const { isPending, run } = useAction();

  async function copiarChave() {
    try {
      await navigator.clipboard.writeText(chavePix);
      toast.success("Chave PIX copiada.");
    } catch {
      toast.error("Não foi possível copiar.");
    }
  }

  return (
    <div className="flex items-center justify-end gap-4">
      <button type="button" className={link} onClick={copiarChave}>
        Copiar chave
      </button>
      <ConfirmButton
        title={`Fez o PIX de ${formatBRL(valor)}?`}
        description="Confirme só depois de pagar. O saque passa para pago e some desta lista."
        confirmLabel="Já paguei"
        onConfirm={() => marcarSaquePago(id)}
        onDone={() => router.refresh()}
        className={link}
      >
        Marcar como pago
      </ConfirmButton>
      <button
        type="button"
        className="whitespace-nowrap text-[13px] font-medium text-ink-muted hover:text-danger hover:underline disabled:opacity-50"
        disabled={isPending}
        onClick={() => run(() => recusarSaque(id), { onSuccess: () => router.refresh() })}
      >
        Recusar
      </button>
    </div>
  );
}
