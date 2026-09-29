"use client";

import { useState } from "react";
import Link from "next/link";
import type { CanalVenda, ProdutoAnuncio } from "@/types/domain";
import { useAction } from "@/components/use-action";
import { useToast } from "@/components/toaster";
import { Field, btnGhost, btnPrimary, inputClass } from "@/components/ui";
import { salvarAnuncio } from "../actions";

function AnuncioForm({
  produtoId,
  canal,
  anuncio,
  nomeProduto,
  descricaoProduto,
}: {
  produtoId: string;
  canal: CanalVenda;
  anuncio?: ProdutoAnuncio;
  nomeProduto: string;
  descricaoProduto: string | null;
}) {
  const { isPending, run } = useAction();
  const toast = useToast();
  const [titulo, setTitulo] = useState(anuncio?.titulo ?? "");
  const [descricao, setDescricao] = useState(anuncio?.descricao ?? "");
  const alterado = titulo !== (anuncio?.titulo ?? "") || descricao !== (anuncio?.descricao ?? "");

  async function copiar() {
    try {
      await navigator.clipboard.writeText([titulo, descricao].filter(Boolean).join("\n\n"));
      toast.success("Anúncio copiado.");
    } catch {
      toast.error("Não foi possível copiar.");
    }
  }

  return (
    <form
      action={(formData) => run(() => salvarAnuncio(formData))}
      className="rounded-lg border border-neutral-800 p-3"
    >
      <input type="hidden" name="produto_id" value={produtoId} />
      <input type="hidden" name="canal_id" value={canal.id} />
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium text-white">{canal.nome}</span>
        <div className="flex gap-1">
          {!titulo && !descricao && (
            <button
              type="button"
              onClick={() => {
                setTitulo(nomeProduto);
                setDescricao(descricaoProduto ?? "");
              }}
              className={`${btnGhost} px-2 py-1 text-xs`}
            >
              Usar dados do produto
            </button>
          )}
          {(titulo || descricao) && (
            <button type="button" onClick={copiar} className={`${btnGhost} px-2 py-1 text-xs`}>
              Copiar
            </button>
          )}
          <button type="submit" disabled={isPending || !alterado} className={`${btnPrimary} px-3 py-1 text-xs`}>
            {isPending ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Field label={`Título (${titulo.length} caracteres)`}>
          <input
            name="titulo"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Título do anúncio"
            className={inputClass}
          />
        </Field>
        <Field label="Descrição">
          <textarea
            name="descricao"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            rows={3}
            placeholder="Descrição do anúncio"
            className={inputClass}
          />
        </Field>
      </div>
    </form>
  );
}

export function AnunciosSection({
  produtoId,
  canais,
  anuncios,
  nomeProduto,
  descricaoProduto,
}: {
  produtoId: string;
  canais: CanalVenda[];
  anuncios: ProdutoAnuncio[];
  nomeProduto: string;
  descricaoProduto: string | null;
}) {
  if (canais.length === 0) {
    return (
      <p className="text-sm text-neutral-500">
        Cadastre canais de venda em{" "}
        <Link href="/configuracoes" className="text-emerald-400 hover:underline">
          Configurações
        </Link>{" "}
        para escrever um anúncio diferente para cada canal.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {canais.map((canal) => (
        <AnuncioForm
          key={canal.id}
          produtoId={produtoId}
          canal={canal}
          anuncio={anuncios.find((a) => a.canal_id === canal.id)}
          nomeProduto={nomeProduto}
          descricaoProduto={descricaoProduto}
        />
      ))}
    </div>
  );
}
