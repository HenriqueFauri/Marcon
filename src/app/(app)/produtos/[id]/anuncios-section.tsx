"use client";

import { useState } from "react";
import Link from "next/link";
import type { CanalVenda, ProdutoAnuncio } from "@/types/domain";
import { gerarAnuncio, limitesDoCanal } from "@/lib/anuncio";
import type { DadosAnuncio } from "@/lib/anuncio";
import { useAction } from "@/components/use-action";
import { useToast } from "@/components/toaster";
import { Field, btnGhost, btnPrimary, inputClass } from "@/components/ui";
import { salvarAnuncio } from "../actions";

function AnuncioForm({
  produtoId,
  canal,
  anuncio,
  dados,
}: {
  produtoId: string;
  canal: CanalVenda;
  anuncio?: ProdutoAnuncio;
  dados: DadosAnuncio;
}) {
  const { isPending, run } = useAction();
  const toast = useToast();
  const [titulo, setTitulo] = useState(anuncio?.titulo ?? "");
  const [descricao, setDescricao] = useState(anuncio?.descricao ?? "");
  const alterado = titulo !== (anuncio?.titulo ?? "") || descricao !== (anuncio?.descricao ?? "");

  const limites = limitesDoCanal(canal.nome);

  async function copiar(texto: string, rotulo: string) {
    try {
      await navigator.clipboard.writeText(texto);
      toast.success(`${rotulo} copiado.`);
    } catch {
      toast.error("Não foi possível copiar.");
    }
  }

  function gerar() {
    if ((titulo || descricao) && !window.confirm("Substituir o texto atual pela sugestão?")) return;
    const sugestao = gerarAnuncio(dados, canal.nome);
    setTitulo(sugestao.titulo);
    setDescricao(sugestao.descricao);
  }

  function contador(atual: number, max: number | null) {
    return max === null ? `${atual} caracteres` : `${atual}/${max}`;
  }

  return (
    <form
      action={(formData) => run(() => salvarAnuncio(formData))}
      className="rounded-2xl border border-line p-3"
    >
      <input type="hidden" name="produto_id" value={produtoId} />
      <input type="hidden" name="canal_id" value={canal.id} />
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium text-ink">{canal.nome}</span>
        <div className="flex flex-wrap gap-1">
          <button type="button" onClick={gerar} className={`${btnGhost} px-2 py-1 text-xs`}>
            Gerar sugestão
          </button>
          {(titulo || descricao) && (
            <button
              type="button"
              onClick={() => copiar([titulo, descricao].filter(Boolean).join("\n\n"), "Anúncio")}
              className={`${btnGhost} px-2 py-1 text-xs`}
            >
              Copiar tudo
            </button>
          )}
          <button type="submit" disabled={isPending || !alterado} className={`${btnPrimary} px-3 py-1 text-xs`}>
            {isPending ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Field label={`Título (${contador(titulo.length, limites.titulo)})`}>
          <input
            name="titulo"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Título do anúncio"
            className={inputClass}
          />
          {limites.titulo !== null && titulo.length > limites.titulo && (
            <p className="mt-1 text-xs text-danger">Passou do limite de {limites.titulo} caracteres deste canal.</p>
          )}
          {titulo && (
            <button type="button" onClick={() => copiar(titulo, "Título")} className="mt-1 text-xs text-brand-text hover:underline">
              Copiar título
            </button>
          )}
        </Field>
        <Field label={`Descrição (${contador(descricao.length, limites.descricao)})`}>
          <textarea
            name="descricao"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            rows={8}
            placeholder="Descrição do anúncio"
            className={inputClass}
          />
          {descricao && (
            <button type="button" onClick={() => copiar(descricao, "Descrição")} className="mt-1 text-xs text-brand-text hover:underline">
              Copiar descrição
            </button>
          )}
        </Field>
      </div>
    </form>
  );
}

function FotosParaAnuncio({ fotos }: { fotos: { id: string; url: string | null }[] }) {
  const toast = useToast();
  const [baixando, setBaixando] = useState(false);
  const comUrl = fotos.filter((f): f is { id: string; url: string } => !!f.url);
  if (comUrl.length === 0) return null;

  // no celular abre o compartilhamento (Facebook, WhatsApp...); no desktop baixa os arquivos
  async function levar() {
    setBaixando(true);
    try {
      const arquivos = await Promise.all(
        comUrl.map(async (f, i) => {
          const blob = await (await fetch(f.url)).blob();
          const ext = blob.type.split("/")[1]?.replace("jpeg", "jpg") || "jpg";
          return new File([blob], `foto-${i + 1}.${ext}`, { type: blob.type });
        }),
      );
      if (navigator.canShare?.({ files: arquivos })) {
        await navigator.share({ files: arquivos });
        return;
      }
      for (const arquivo of arquivos) {
        const link = document.createElement("a");
        link.href = URL.createObjectURL(arquivo);
        link.download = arquivo.name;
        link.click();
        URL.revokeObjectURL(link.href);
      }
      toast.success(`${arquivos.length} foto(s) baixada(s).`);
    } catch (e) {
      if ((e as Error).name !== "AbortError") toast.error("Não foi possível preparar as fotos.");
    } finally {
      setBaixando(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line p-3">
      <span className="text-sm text-ink-2">{comUrl.length} foto(s) do produto, a primeira é a capa.</span>
      <button type="button" onClick={levar} disabled={baixando} className={`${btnGhost} px-3 py-1 text-xs`}>
        {baixando ? "Preparando..." : "Baixar / compartilhar fotos"}
      </button>
    </div>
  );
}

export function AnunciosSection({
  produtoId,
  canais,
  anuncios,
  dados,
  fotos,
}: {
  produtoId: string;
  canais: CanalVenda[];
  anuncios: ProdutoAnuncio[];
  dados: DadosAnuncio;
  fotos: { id: string; url: string | null }[];
}) {
  if (canais.length === 0) {
    return (
      <p className="text-sm text-ink-muted">
        Cadastre canais de venda em{" "}
        <Link href="/configuracoes" className="text-brand-text hover:underline">
          Configurações
        </Link>{" "}
        para escrever um anúncio diferente para cada canal.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <FotosParaAnuncio fotos={fotos} />
      {canais.map((canal) => (
        <AnuncioForm key={canal.id} produtoId={produtoId} canal={canal} anuncio={anuncios.find((a) => a.canal_id === canal.id)} dados={dados} />
      ))}
    </div>
  );
}
