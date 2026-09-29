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
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  size?: "sm" | "md" | "lg";
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
      className={`m-auto max-h-[92dvh] w-[calc(100%-2rem)] ${largura} overflow-y-auto rounded-2xl border border-neutral-800 bg-neutral-900 p-0 text-neutral-100 shadow-2xl shadow-black/50 backdrop:bg-black/70 backdrop:backdrop-blur-sm`}
    >
      {open && (
        <div className="p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-white">{title}</h2>
              {description && <p className="mt-1 text-sm text-neutral-400">{description}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="-mr-1 -mt-1 rounded-md p-1 text-neutral-500 hover:bg-neutral-800 hover:text-white"
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
