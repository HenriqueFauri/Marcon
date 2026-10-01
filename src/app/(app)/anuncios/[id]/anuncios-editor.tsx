"use client";

import { useState } from "react";
import type { CanalVenda, ProdutoAnuncio, ProdutoVariacao } from "@/types/domain";
import { gerarAnuncio, limitesDoCanal } from "@/lib/anuncio";
import type { DadosAnuncio } from "@/lib/anuncio";
import { useAction } from "@/components/use-action";
import { useToast } from "@/components/toaster";
import { ConfirmButton } from "@/components/confirm-button";
import { Card, btnGhost, btnPrimary, btnSecondary, inputClass } from "@/components/ui";
import { IconPlus } from "@/components/icons";
import { excluirVersaoAnuncio, salvarVersaoAnuncio } from "../actions";

function useCopiar() {
  const toast = useToast();
  return async function copiar(texto: string, rotulo: string) {
    try {
      await navigator.clipboard.writeText(texto);
      toast.success(`${rotulo} copiado.`);
    } catch {
      toast.error("Não foi possível copiar.");
    }
  };
}

function contador(atual: number, max: number | null) {
  return max === null ? `${atual} caracteres` : `${atual}/${max}`;
}

function VersaoCard({
  numero,
  produtoId,
  canais,
  versao,
  variacoes,
  dados,
}: {
  numero: number;
  produtoId: string;
  canais: CanalVenda[];
  versao: ProdutoAnuncio;
  variacoes: ProdutoVariacao[];
  dados: DadosAnuncio;
}) {
  const { isPending, run } = useAction();
  const copiar = useCopiar();
  const [titulo, setTitulo] = useState(versao.titulo ?? "");
  const [descricao, setDescricao] = useState(versao.descricao ?? "");
  const [variacaoId, setVariacaoId] = useState(versao.variacao_id ?? "");
  const [canalId, setCanalId] = useState(versao.canal_id ?? "");
  const [estilo, setEstilo] = useState(numero);
  const alterado =
    titulo !== (versao.titulo ?? "") ||
    descricao !== (versao.descricao ?? "") ||
    variacaoId !== (versao.variacao_id ?? "") ||
    canalId !== (versao.canal_id ?? "");
  const canal = canais.find((c) => c.id === canalId);
  const limites = limitesDoCanal(canal?.nome ?? "");

  function reescrever() {
    const sugestao = gerarAnuncio(dados, canal?.nome ?? "", {
      estilo,
      variacao: variacoes.find((v) => v.id === variacaoId) ?? null,
    });
    setEstilo((e) => e + 1);
    setTitulo(sugestao.titulo);
    setDescricao(sugestao.descricao);
  }

  function salvar() {
    run(() =>
      salvarVersaoAnuncio({ id: versao.id, produtoId, canalId: canalId || null, variacaoId: variacaoId || null, titulo, descricao }),
    );
  }

  const tituloEstourou = limites.titulo !== null && titulo.length > limites.titulo;
  const descricaoEstourou = limites.descricao !== null && descricao.length > limites.descricao;

  return (
    <div className="rounded-2xl border border-line p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-ink">Versão {numero}</span>
          {canais.length > 0 && (
            <select
              value={canalId}
              onChange={(e) => setCanalId(e.target.value)}
              aria-label="Canal de venda"
              title="O canal só ajusta o limite de caracteres e o estilo da sugestão"
              className={`${inputClass} !w-auto !py-1 text-xs`}
            >
              <option value="">Qualquer canal</option>
              {canais.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          )}
          {variacoes.length > 0 && (
            <select
              value={variacaoId}
              onChange={(e) => setVariacaoId(e.target.value)}
              aria-label="Anúncio para"
              className={`${inputClass} !w-auto !py-1 text-xs`}
            >
              <option value="">Produto todo</option>
              {variacoes.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nome_combinacao}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={reescrever} className={`${btnGhost} px-3 py-1 text-xs`}>
            Outra sugestão
          </button>
          <ConfirmButton
            title="Excluir esta versão?"
            description={versao.titulo ?? "Versão sem título"}
            ariaLabel="Excluir versão"
            onConfirm={() => excluirVersaoAnuncio(versao.id, produtoId)}
          />
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div>
          <div className="mb-1 flex items-center justify-between gap-2">
            <label htmlFor={`t-${versao.id}`} className="text-sm font-medium text-ink-2">
              Título{" "}
              <span className={`font-normal ${tituloEstourou ? "text-danger" : "text-ink-muted"}`}>
                ({contador(titulo.length, limites.titulo)})
              </span>
            </label>
            <button
              type="button"
              disabled={!titulo}
              onClick={() => copiar(titulo, "Título")}
              className={`${btnSecondary} px-3 py-1 text-xs`}
            >
              Copiar título
            </button>
          </div>
          <input
            id={`t-${versao.id}`}
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Título do anúncio"
            className={inputClass}
          />
          {tituloEstourou && <p className="mt-1 text-xs text-danger">Passou do limite de {limites.titulo} caracteres deste canal.</p>}
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between gap-2">
            <label htmlFor={`d-${versao.id}`} className="text-sm font-medium text-ink-2">
              Descrição{" "}
              <span className={`font-normal ${descricaoEstourou ? "text-danger" : "text-ink-muted"}`}>
                ({contador(descricao.length, limites.descricao)})
              </span>
            </label>
            <button
              type="button"
              disabled={!descricao}
              onClick={() => copiar(descricao, "Descrição")}
              className={`${btnSecondary} px-3 py-1 text-xs`}
            >
              Copiar descrição
            </button>
          </div>
          <textarea
            id={`d-${versao.id}`}
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            rows={8}
            placeholder="Descrição do anúncio"
            className={inputClass}
          />
          {descricaoEstourou && (
            <p className="mt-1 text-xs text-danger">Passou do limite de {limites.descricao} caracteres deste canal.</p>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          disabled={!titulo && !descricao}
          onClick={() => copiar([titulo, descricao].filter(Boolean).join("\n\n"), "Anúncio")}
          className={`${btnGhost} px-3 py-1.5 text-sm`}
        >
          Copiar tudo
        </button>
        <button type="button" onClick={salvar} disabled={isPending || !alterado} className={`${btnPrimary} px-4 py-1.5 text-sm`}>
          {isPending ? "Salvando..." : alterado ? "Salvar alterações" : "Salvo"}
        </button>
      </div>
    </div>
  );
}

export function AnunciosEditor({
  produtoId,
  canais,
  anuncios,
  variacoes,
  dados,
}: {
  produtoId: string;
  canais: CanalVenda[];
  anuncios: ProdutoAnuncio[];
  variacoes: ProdutoVariacao[];
  dados: DadosAnuncio;
}) {
  const { isPending, run } = useAction();

  function nova(sugerir: boolean) {
    const sugestao = sugerir ? gerarAnuncio(dados, "", { estilo: anuncios.length }) : { titulo: "", descricao: "" };
    run(() =>
      salvarVersaoAnuncio({
        id: null,
        produtoId,
        canalId: null,
        variacaoId: null,
        titulo: sugestao.titulo,
        descricao: sugestao.descricao,
      }),
    );
  }

  return (
    <Card
      title="Títulos e descrições"
      description="Crie várias versões, ajuste e copie a que quiser usar em qualquer marketplace. Se quiser, escolha o canal para respeitar o limite de caracteres dele."
    >
      <div className="flex flex-col gap-3">
        {anuncios.length === 0 && (
          <p className="text-sm text-ink-muted">Nenhuma versão ainda. Gere uma sugestão e ajuste.</p>
        )}
        {anuncios.map((v, i) => (
          <VersaoCard key={v.id} numero={i + 1} produtoId={produtoId} canais={canais} versao={v} variacoes={variacoes} dados={dados} />
        ))}
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => nova(true)} disabled={isPending} className={btnPrimary}>
            <IconPlus width={16} height={16} /> Nova versão com sugestão
          </button>
          <button type="button" onClick={() => nova(false)} disabled={isPending} className={btnSecondary}>
            Versão em branco
          </button>
        </div>
      </div>
    </Card>
  );
}
