"use client";

import { RotuloAcao } from "@/components/rotulo-acao";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAction } from "@/components/use-action";
import { useToast } from "@/components/toaster";
import { Grupo } from "@/components/ajustes";
import { Field, btnPrimary, btnSecondary, inputClass } from "@/components/ui";
import { IconLink, IconWhatsapp } from "@/components/icons";
import { formatBRL } from "@/lib/format";
import { SAQUE_MINIMO } from "@/lib/indicacao";
import { pedirSaque } from "./actions";

// Link + mensagem pronta: o afiliado só escolhe como mandar.
export function CompartilharCard({ link, mensagem, descricao }: { link: string; mensagem: string; descricao: string }) {
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
    <Grupo titulo="Seu link" rodape={descricao}>
      <div className="flex items-center gap-2">
        <input readOnly value={link} aria-label="Seu link de indicação" onFocus={(e) => e.currentTarget.select()} className={`${inputClass} font-mono text-[13px]`} />
        <button type="button" onClick={() => copiar(link, "Link copiado.")} className={`${btnSecondary} shrink-0`}>
          <IconLink width={16} height={16} /> Copiar
        </button>
      </div>

      <div className="border-t border-line pt-4">
        <p className="mb-1 text-[13px] text-ink-muted">Mensagem pronta</p>
        <p className="text-[15px] text-ink">{mensagem}</p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <a
          href={`https://wa.me/?text=${encodeURIComponent(mensagem)}`}
          target="_blank"
          rel="noopener noreferrer"
          className={`${btnPrimary} w-full sm:w-auto`}
        >
          <IconWhatsapp width={18} height={18} /> Mandar no WhatsApp
        </a>
        <button type="button" onClick={() => copiar(mensagem, "Mensagem copiada.")} className={`${btnSecondary} w-full sm:w-auto`}>
          Copiar mensagem
        </button>
      </div>
    </Grupo>
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
      <Grupo titulo="Saque pedido" rodape="Quando o PIX cair, ele aparece no extrato como pago.">
        <p className="text-[15px] text-ink">
          {formatBRL(emPedido)} por PIX{chavePix ? ` para ${chavePix}` : ""}.
        </p>
      </Grupo>
    );
  }

  if (!pode) {
    const andamento = Math.min(100, Math.round((disponivel / SAQUE_MINIMO) * 100));
    return (
      <Grupo titulo="Sacar" rodape={`O saque é por PIX, a partir de ${formatBRL(SAQUE_MINIMO)}.`}>
        <div>
          <div className="h-2 overflow-hidden rounded-full bg-fill" role="progressbar" aria-valuenow={andamento} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-brand-fill transition-all" style={{ width: `${andamento}%` }} />
          </div>
          <p className="mt-2 text-[13px] text-ink-muted">
            {formatBRL(disponivel)} de {formatBRL(SAQUE_MINIMO)}. Faltam {formatBRL(SAQUE_MINIMO - disponivel)}.
          </p>
        </div>
      </Grupo>
    );
  }

  return (
    <Grupo titulo={`Sacar ${formatBRL(disponivel)}`}>
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
        <button type="submit" disabled={isPending} className={`${btnPrimary} w-full sm:mb-px sm:w-auto`}>
          <RotuloAcao pendente={isPending} ocupado="Pedindo...">{"Pedir saque"}</RotuloAcao>
        </button>
      </form>
    </Grupo>
  );
}
