"use client";

import { useTransition } from "react";
import type { CanalVenda, ProdutoAnuncio } from "@/types/domain";
import { salvarAnuncio } from "../actions";

export function AnunciosSection({
  produtoId,
  canais,
  anuncios,
}: {
  produtoId: string;
  canais: CanalVenda[];
  anuncios: ProdutoAnuncio[];
}) {
  const [isPending, startTransition] = useTransition();

  if (canais.length === 0) {
    return (
      <p className="text-sm text-neutral-500">
        Cadastre canais de venda em Configurações para gerenciar título e descrição de anúncio por canal.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {canais.map((canal) => {
        const anuncio = anuncios.find((a) => a.canal_id === canal.id);
        return (
          <form
            key={canal.id}
            action={(formData) => startTransition(() => salvarAnuncio(formData))}
            className="rounded-lg border border-neutral-800 p-3"
          >
            <input type="hidden" name="produto_id" value={produtoId} />
            <input type="hidden" name="canal_id" value={canal.id} />
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-white">{canal.nome}</span>
              <button
                type="submit"
                disabled={isPending}
                className="rounded-md bg-emerald-500 px-3 py-1 text-xs font-medium text-neutral-950 hover:bg-emerald-400 disabled:opacity-50"
              >
                Salvar
              </button>
            </div>
            <input
              name="titulo"
              defaultValue={anuncio?.titulo ?? ""}
              placeholder="Título do anúncio"
              className="mb-2 w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
            />
            <textarea
              name="descricao"
              defaultValue={anuncio?.descricao ?? ""}
              rows={3}
              placeholder="Descrição do anúncio"
              className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
            />
          </form>
        );
      })}
    </div>
  );
}
