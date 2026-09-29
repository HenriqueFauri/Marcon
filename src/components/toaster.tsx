"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { IconAlert, IconCheck, IconX } from "./icons";

type ToastTipo = "success" | "error";
interface Toast {
  id: number;
  tipo: ToastTipo;
  mensagem: string;
}

interface ToastApi {
  success: (mensagem: string) => void;
  error: (mensagem: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const proximoId = useRef(0);

  const remover = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const mostrar = useCallback(
    (tipo: ToastTipo, mensagem: string) => {
      const id = ++proximoId.current;
      setToasts((prev) => [...prev.slice(-2), { id, tipo, mensagem }]);
      setTimeout(() => remover(id), tipo === "error" ? 6000 : 3500);
    },
    [remover],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (m) => mostrar("success", m),
      error: (m) => mostrar("error", m),
    }),
    [mostrar],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6 lg:items-end lg:px-6"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tipo === "error" ? "alert" : "status"}
            className={`pointer-events-auto flex w-full max-w-sm items-start gap-2 rounded-xl border px-4 py-3 text-sm shadow-lg shadow-black/40 ${
              t.tipo === "error"
                ? "border-red-500/30 bg-neutral-900 text-red-300"
                : "border-emerald-500/30 bg-neutral-900 text-emerald-300"
            }`}
          >
            {t.tipo === "error" ? (
              <IconAlert className="mt-0.5 shrink-0" />
            ) : (
              <IconCheck className="mt-0.5 shrink-0" />
            )}
            <span className="flex-1">{t.mensagem}</span>
            <button
              onClick={() => remover(t.id)}
              aria-label="Fechar aviso"
              className="shrink-0 text-neutral-500 hover:text-white"
            >
              <IconX width={16} height={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast precisa estar dentro de <ToastProvider>");
  return ctx;
}
