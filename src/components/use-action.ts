"use client";

import { useTransition } from "react";
import { mensagemDeErro, type ActionResult } from "@/lib/action";
import { useToast } from "./toaster";

// Roda uma server action numa transition e transforma o resultado em aviso na
// tela. Sem isso, um erro lançado derruba a página inteira no error boundary.
export function useAction() {
  const [isPending, startTransition] = useTransition();
  const toast = useToast();

  function run(
    fn: () => Promise<ActionResult | void>,
    opts: { success?: string; onSuccess?: () => void; onError?: (erro: string) => void } = {},
  ) {
    startTransition(async () => {
      try {
        const resultado = await fn();
        if (resultado && !resultado.ok) {
          toast.error(resultado.error);
          opts.onError?.(resultado.error);
          return;
        }
        const mensagem = (resultado && resultado.message) || opts.success;
        if (mensagem) toast.success(mensagem);
        opts.onSuccess?.();
      } catch (e) {
        const erro = mensagemDeErro(e);
        toast.error(erro);
        opts.onError?.(erro);
      }
    });
  }

  return { isPending, run };
}
