"use client";

import { useRef, useState, useTransition } from "react";
import { criarLancamentoManual } from "./actions";

export function NovoLancamentoForm() {
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-emerald-400"
      >
        + Novo lançamento
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-md rounded-xl border border-neutral-800 bg-neutral-900 p-5">
        <h2 className="mb-4 text-base font-semibold text-white">Novo lançamento manual</h2>
        <form
          ref={formRef}
          action={(formData) =>
            startTransition(async () => {
              await criarLancamentoManual(formData);
              setOpen(false);
            })
          }
          className="flex flex-col gap-4"
        >
          <div className="flex gap-2">
            <label className="flex-1 cursor-pointer rounded-lg border border-neutral-700 p-2 text-center text-sm has-[:checked]:border-emerald-500 has-[:checked]:text-emerald-400">
              <input type="radio" name="tipo" value="entrada" defaultChecked className="sr-only" />
              Entrada
            </label>
            <label className="flex-1 cursor-pointer rounded-lg border border-neutral-700 p-2 text-center text-sm has-[:checked]:border-red-500 has-[:checked]:text-red-400">
              <input type="radio" name="tipo" value="saida" className="sr-only" />
              Saída
            </label>
          </div>

          <div>
            <label className="mb-1 block text-xs text-neutral-400">Descrição</label>
            <input
              name="descricao"
              required
              className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
              placeholder="Ex: Conta de luz"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-neutral-400">Valor (R$)</label>
              <input
                name="valor"
                type="number"
                step="0.01"
                min="0.01"
                required
                className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-neutral-400">Data</label>
              <input
                name="data"
                type="date"
                defaultValue={new Date().toISOString().slice(0, 10)}
                className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs text-neutral-400">Categoria</label>
            <input
              name="categoria"
              defaultValue="Outros"
              className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
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
