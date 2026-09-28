"use client";

import { useState, useTransition } from "react";
import { criarCliente } from "./actions";

export function NovoClienteForm() {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-emerald-400"
      >
        + Novo cliente
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-sm rounded-xl border border-neutral-800 bg-neutral-900 p-5">
        <h2 className="mb-4 text-base font-semibold text-white">Novo cliente</h2>
        <form
          action={(formData) =>
            startTransition(async () => {
              await criarCliente(formData);
              setOpen(false);
            })
          }
          className="flex flex-col gap-4"
        >
          <div>
            <label className="mb-1 block text-xs text-neutral-400">Nome *</label>
            <input
              name="nome"
              required
              className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
              placeholder="Nome completo"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-neutral-400">Telefone</label>
            <input
              name="telefone"
              className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
              placeholder="(11) 99999-9999"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-neutral-400">E-mail</label>
            <input
              name="email"
              type="email"
              className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-neutral-400">CPF/CNPJ</label>
            <input
              name="cpf_cnpj"
              className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
              placeholder="Opcional"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-800"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-emerald-400 disabled:opacity-50"
            >
              {isPending ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
