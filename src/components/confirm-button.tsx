"use client";

import { useState, type ReactNode } from "react";
import type { ActionResult } from "@/lib/action";
import { Modal } from "./modal";
import { btnDanger, btnGhost, btnIconDanger } from "./ui";
import { IconTrash } from "./icons";
import { useAction } from "./use-action";

// Botão de ação destrutiva com confirmação num modal (em vez do confirm() do navegador).
export function ConfirmButton({
  title,
  description,
  confirmLabel = "Excluir",
  successMessage,
  onConfirm,
  onDone,
  children,
  className,
  ariaLabel,
}: {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  successMessage?: string;
  onConfirm: () => Promise<ActionResult | void>;
  onDone?: () => void;
  children?: ReactNode;
  className?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const { isPending, run } = useAction();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={className ?? btnIconDanger}
        aria-label={ariaLabel ?? confirmLabel}
        title={ariaLabel ?? confirmLabel}
      >
        {children ?? <IconTrash width={16} height={16} />}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={title} description={description} size="sm">
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={() => setOpen(false)} className={btnGhost}>
            Cancelar
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() =>
              run(onConfirm, {
                success: successMessage,
                onSuccess: () => {
                  setOpen(false);
                  onDone?.();
                },
              })
            }
            className={btnDanger}
          >
            {isPending ? "Aguarde..." : confirmLabel}
          </button>
        </div>
      </Modal>
    </>
  );
}
