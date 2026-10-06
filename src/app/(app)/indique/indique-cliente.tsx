"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAction } from "@/components/use-action";
import { useToast } from "@/components/toaster";
import { Card, Field, btnPrimary, btnSecondary, inputClass } from "@/components/ui";
import { IconLink, IconWhatsapp } from "@/components/icons";
import { formatBRL } from "@/lib/format";
import { SAQUE_MINIMO } from "@/lib/indicacao";
import { pedirSaque } from "./actions";

// Link + mensagem pronta: o afiliado só escolhe como mandar.
export function CompartilharCard({ link, mensagem }: { link: string; mensagem: string }) {
  const toast = useToast();

  async function copiar(texto: string, aviso: string) {
    try {
      await navigator.clipboard.writeText(texto);
      toast.success(aviso);
    } catch {
      toast.error("Não foi possível copiar. Selecione o texto e copie à mão.");
    }
  }

  return (
    <Card title="Seu link" description="Quem criar a conta por ele fica ligado a você, em qualquer aparelho.">
      <div className="flex items-center gap-2">
        <input readOnly value={link} aria-label="Seu link de indicação" onFocus={(e) => e.currentTarget.select()} className={`${inputClass} font-mono text-[13px]`} />
        <button type="button" onClick={() => copiar(link, "Link copiado.")} className={`${btnSecondary} shrink-0`}>
          <IconLink width={16} height={16} /> Copiar
        </button>
      </div>

      <p className="mb-1.5 mt-5 text-xs font-medium text-ink-muted">Mensagem pronta</p>
      <p className="rounded-2xl bg-fill px-4 py-3 text-[15px] text-ink-2">{mensagem}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        <a
          href={`https://wa.me/?text=${encodeURIComponent(mensagem)}`}
          target="_blank"
          rel="noopener noreferrer"
          className={btnPrimary}
        >
          <IconWhatsapp width={18} height={18} /> Mandar no WhatsApp
        </a>
        <button type="button" onClick={() => copiar(mensagem, "Mensagem copiada.")} className={btnSecondary}>
          Copiar mensagem
        </button>
      </div>
    </Card>
  );
}

// Pedir o saque é um toque: a chave PIX fica guardada para a próxima vez.
export function SaqueCard({
  disponivel,
  chavePix,
  emPedido,
}: {
  disponivel: number;
  chavePix: string | null;
  emPedido: number;
}) {
  const router = useRouter();
  const { isPending, run } = useAction();
  const [chave, setChave] = useState(chavePix ?? "");
  const pode = disponivel >= SAQUE_MINIMO;

  if (emPedido > 0 && !pode) {
    return (
      <Card title="Saque pedido">
        <p className="text-[15px] text-ink-2">
          Você pediu {formatBRL(emPedido)} por PIX{chavePix ? ` para ${chavePix}` : ""}. Assim que o pagamento for feito, ele aparece no extrato como pago.
        </p>
      </Card>
    );
  }

  if (!pode) {
    const andamento = Math.min(100, Math.round((disponivel / SAQUE_MINIMO) * 100));
    return (
      <Card title="Sacar" description={`Você pode sacar a partir de ${formatBRL(SAQUE_MINIMO)}, por PIX.`}>
        <div className="h-2 overflow-hidden rounded-full bg-fill" role="progressbar" aria-valuenow={andamento} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-brand-fill transition-all" style={{ width: `${andamento}%` }} />
        </div>
        <p className="mt-2 text-[13px] text-ink-muted">
          {formatBRL(disponivel)} de {formatBRL(SAQUE_MINIMO)}. Faltam {formatBRL(SAQUE_MINIMO - disponivel)}.
        </p>
      </Card>
    );
  }

  return (
    <Card title={`Sacar ${formatBRL(disponivel)}`} description="O dinheiro vai por PIX, para a chave que você informar.">
      <form
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => pedirSaque(chave), { onSuccess: () => router.refresh() });
        }}
      >
        <div className="flex-1">
          <Field label="Sua chave PIX">
            <input
              required
              value={chave}
              onChange={(e) => setChave(e.target.value)}
              className={inputClass}
              placeholder="CPF, e-mail, celular ou chave aleatória"
              autoComplete="off"
            />
          </Field>
        </div>
        <button type="submit" disabled={isPending} className={`${btnPrimary} sm:mb-px`}>
          {isPending ? "Pedindo..." : "Pedir saque"}
        </button>
      </form>
    </Card>
  );
}
