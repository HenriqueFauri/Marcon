"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { IconX } from "./icons";

// <dialog> nativo: Esc fecha, o foco fica preso dentro e o conteúdo atrás fica inerte.
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  size = "md",
  folha = false,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  size?: "sm" | "md" | "lg";
  // no celular, sobe de baixo com a largura toda (como as folhas do iPhone)
  folha?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const largura = { sm: "max-w-sm", md: "max-w-md", lg: "max-w-2xl" }[size];

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={`m-auto max-h-[92dvh] w-[calc(100%-2rem)] ${largura} overflow-y-auto rounded-[28px] bg-surface p-0 text-ink shadow-2xl shadow-black/30 backdrop:bg-black/40 backdrop:backdrop-blur-sm ${
        folha
          ? "folha max-sm:mb-0 max-sm:w-full max-sm:max-w-none max-sm:rounded-b-none max-sm:pb-[env(safe-area-inset-bottom)]"
          : ""
      }`}
    >
      {open && (
        <div className="p-5">
          {folha && <div aria-hidden="true" className="mx-auto -mt-2 mb-3 h-[5px] w-9 rounded-full bg-fill-strong sm:hidden" />}
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-ink">{title}</h2>
              {description && <p className="mt-1 text-sm text-ink-muted">{description}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="-mr-1 -mt-1 rounded-md p-1 text-ink-muted hover:bg-fill hover:text-ink"
            >
              <IconX />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
