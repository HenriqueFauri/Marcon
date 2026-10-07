"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { CanalVenda, ProdutoAnuncio, ProdutoVariacao } from "@/types/domain";
import { gerarAnuncio, limitesDoCanal } from "@/lib/anuncio";
import type { DadosAnuncio } from "@/lib/anuncio";
import { useAction } from "@/components/use-action";
import { useToast } from "@/components/toaster";
import { ConfirmButton } from "@/components/confirm-button";
import { Card, btnGhost, btnPrimary, btnSecondary, inputClass } from "@/components/ui";
import { IconPlus, IconSparkles } from "@/components/icons";
import { ENTREGAS, ESTADOS, LIMITE_ACOMPANHA, LIMITE_DICA, PERGUNTAS_VAZIAS, type PerguntasIA } from "@/lib/ia-perguntas";
import { escreverAnuncioIA, excluirVersaoAnuncio, salvarVersaoAnuncio } from "../actions";


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

// Chama a IA e avisa quanto sobrou da cota. Devolve null se deu erro (o aviso já saiu).
function useEscreverComIA() {
  const toast = useToast();
  const [escrevendo, startTransition] = useTransition();

  function escrever(
    dados: Parameters<typeof escreverAnuncioIA>[0],
    usar: (texto: { titulo: string; descricao: string }) => void,
  ) {
    startTransition(async () => {
      try {
        const r = await escreverAnuncioIA(dados);
        if (!r.ok) {
          toast.error(r.error);
          return;
        }
        usar(r);
        toast.success(
          r.restantes === null
            ? "Anúncio escrito. Revise antes de usar."
            : `Anúncio escrito. Revise antes de usar. Restam ${r.restantes} escrita(s) com IA este mês.`,
        );
      } catch {
        toast.error("A IA não conseguiu escrever agora. Tente de novo.");
      }
    });
  }

  return { escrevendo, escrever };
}

function contador(atual: number, max: number | null) {
  return max === null ? `${atual} caracteres` : `${atual}/${max}`;
}

const linkAcao = "text-[13px] font-medium text-brand-text hover:underline disabled:opacity-40 disabled:no-underline";

// Escolha única em botões: tocar de novo na opção marcada desmarca ("não informar").
function Escolha({
  rotulo,
  opcoes,
  valor,
  onChange,
}: {
  rotulo: string;
  opcoes: readonly { id: string; curto: string }[];
  valor: string;
  onChange: (id: string) => void;
}) {
  return (
    <div role="group" aria-label={rotulo}>
      <p className="mb-1.5 text-[13px] font-medium text-ink-muted">{rotulo}</p>
      <div className="flex flex-wrap gap-1.5">
        {opcoes.map((o) => {
          const marcada = o.id === valor;
          return (
            <button
              key={o.id}
              type="button"
              aria-pressed={marcada}
              onClick={() => onChange(marcada ? "" : o.id)}
              className={`rounded-full px-3.5 py-1.5 text-sm transition ${
                marcada ? "bg-brand-fill font-semibold text-on-brand" : "bg-surface text-ink-2 hover:bg-fill-strong"
              }`}
            >
              {o.curto}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Perguntas rápidas + botão de escrever. O que fica em branco a IA não diz.
function GeradorIA({
  perguntas,
  onChange,
  onGerar,
  ocupado,
  escrevendo,
  temVersao,
}: {
  perguntas: PerguntasIA;
  onChange: (p: PerguntasIA) => void;
  onGerar: () => void;
  ocupado: boolean;
  escrevendo: boolean;
  temVersao: boolean;
}) {
  const [maisDetalhes, setMaisDetalhes] = useState(false);
  return (
    <div className="mb-4 rounded-2xl bg-fill p-4">
      <div className="flex flex-col gap-4">
        <Escolha rotulo="Estado" opcoes={ESTADOS} valor={perguntas.estado} onChange={(estado) => onChange({ ...perguntas, estado })} />
        <Escolha rotulo="Retirada e entrega" opcoes={ENTREGAS} valor={perguntas.entrega} onChange={(entrega) => onChange({ ...perguntas, entrega })} />
        <div>
          <label htmlFor="ia-acompanha" className="mb-1.5 block text-[13px] font-medium text-ink-muted">
            O que acompanha
          </label>
          <input
            id="ia-acompanha"
            value={perguntas.acompanha}
            onChange={(e) => onChange({ ...perguntas, acompanha: e.target.value })}
            maxLength={LIMITE_ACOMPANHA}
            placeholder="Caixa, cabo, divisor de áudio..."
            className={`${inputClass} !bg-surface`}
          />
        </div>
        {maisDetalhes || perguntas.dica ? (
          <div>
            <label htmlFor="ia-dica" className="mb-1.5 block text-[13px] font-medium text-ink-muted">
              Mais alguma coisa
            </label>
            <input
              id="ia-dica"
              value={perguntas.dica}
              onChange={(e) => onChange({ ...perguntas, dica: e.target.value })}
              maxLength={LIMITE_DICA}
              placeholder="Ótimo para presente, bateria dura o dia todo..."
              className={`${inputClass} !bg-surface`}
            />
          </div>
        ) : (
          <button type="button" onClick={() => setMaisDetalhes(true)} className={`${linkAcao} self-start`}>
            + Mais detalhes
          </button>
        )}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <button type="button" onClick={onGerar} disabled={ocupado || escrevendo} className={btnPrimary}>
          <IconSparkles width={16} height={16} /> {escrevendo ? "Escrevendo..." : temVersao ? "Escrever outra versão com IA" : "Escrever com IA"}
        </button>
        <span className="text-xs text-ink-muted">O que ficar em branco, a IA não diz.</span>
      </div>
    </div>
  );
}

function VersaoCard({
  numero,
  produtoId,
  canal,
  versao,
  variacoes,
  dados,
  ia,
}: {
  numero: number;
  produtoId: string;
  canal: CanalVenda;
  versao: ProdutoAnuncio;
  variacoes: ProdutoVariacao[];
  dados: DadosAnuncio;
  ia: { disponivel: boolean; perguntas: PerguntasIA };
}) {
  const { isPending, run } = useAction();
  const { escrevendo, escrever } = useEscreverComIA();
  const copiar = useCopiar();
  const [titulo, setTitulo] = useState(versao.titulo ?? "");
  const [descricao, setDescricao] = useState(versao.descricao ?? "");
  const [variacaoId, setVariacaoId] = useState(versao.variacao_id ?? "");
  const [estilo, setEstilo] = useState(numero);
  const alterado =
    titulo !== (versao.titulo ?? "") || descricao !== (versao.descricao ?? "") || variacaoId !== (versao.variacao_id ?? "");
  const limites = limitesDoCanal(canal.nome);

  function reescrever() {
    const sugestao = gerarAnuncio(dados, canal.nome, {
      estilo,
      variacao: variacoes.find((v) => v.id === variacaoId) ?? null,
    });
    setEstilo((e) => e + 1);
    setTitulo(sugestao.titulo);
    setDescricao(sugestao.descricao);
  }

  function reescreverComIA() {
    escrever({ produtoId, canalId: canal.id, variacaoId: variacaoId || null, perguntas: ia.perguntas }, (texto) => {
      setTitulo(texto.titulo);
      setDescricao(texto.descricao);
    });
  }

  function salvar() {
    run(() =>
      salvarVersaoAnuncio({ id: versao.id, produtoId, canalId: canal.id, variacaoId: variacaoId || null, titulo, descricao }),
    );
  }

  const tituloEstourou = limites.titulo !== null && titulo.length > limites.titulo;
  const descricaoEstourou = limites.descricao !== null && descricao.length > limites.descricao;

  return (
    <div className="rounded-2xl border border-line p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-ink">Versão {numero}</span>
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
          {ia.disponivel ? (
            <button
              type="button"
              onClick={reescreverComIA}
              disabled={escrevendo}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-brand-text transition hover:bg-brand-tint disabled:opacity-50"
            >
              <IconSparkles width={14} height={14} /> {escrevendo ? "Escrevendo..." : "Reescrever com IA"}
            </button>
          ) : (
            <button type="button" onClick={reescrever} className={`${btnGhost} px-3 py-1 text-xs`}>
              Outra sugestão
            </button>
          )}
          <ConfirmButton
            title="Excluir esta versão?"
            description={versao.titulo ?? "Versão sem título"}
            ariaLabel="Excluir versão"
            onConfirm={() => excluirVersaoAnuncio(versao.id, produtoId)}
          />
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div>
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <label htmlFor={`t-${versao.id}`} className="text-[13px] font-medium text-ink-muted">
              Título
            </label>
            <span className="flex items-baseline gap-3 text-xs">
              <span className={tituloEstourou ? "text-danger" : "text-ink-muted"}>{contador(titulo.length, limites.titulo)}</span>
              <button type="button" disabled={!titulo} onClick={() => copiar(titulo, "Título")} className={linkAcao}>
                Copiar
              </button>
            </span>
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
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <label htmlFor={`d-${versao.id}`} className="text-[13px] font-medium text-ink-muted">
              Descrição
            </label>
            <span className="flex items-baseline gap-3 text-xs">
              <span className={descricaoEstourou ? "text-danger" : "text-ink-muted"}>{contador(descricao.length, limites.descricao)}</span>
              <button type="button" disabled={!descricao} onClick={() => copiar(descricao, "Descrição")} className={linkAcao}>
                Copiar
              </button>
            </span>
          </div>
          <textarea
            id={`d-${versao.id}`}
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            rows={Math.min(16, Math.max(6, descricao.split("\n").length + 1))}
            placeholder="Descrição do anúncio"
            className={inputClass}
          />
          {descricaoEstourou && (
            <p className="mt-1 text-xs text-danger">Passou do limite de {limites.descricao} caracteres deste canal.</p>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          disabled={!titulo && !descricao}
          onClick={() => copiar([titulo, descricao].filter(Boolean).join("\n\n"), "Anúncio")}
          className={`${btnSecondary} px-4 py-1.5 text-sm`}
        >
          Copiar tudo
        </button>
        {alterado ? (
          <button type="button" onClick={salvar} disabled={isPending} className={`${btnPrimary} px-4 py-1.5 text-sm`}>
            {isPending ? "Salvando..." : "Salvar alterações"}
          </button>
        ) : (
          <span className="text-xs text-ink-muted">Salvo</span>
        )}
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
  iaDisponivel,
}: {
  produtoId: string;
  canais: CanalVenda[];
  anuncios: ProdutoAnuncio[];
  variacoes: ProdutoVariacao[];
  dados: DadosAnuncio;
  iaDisponivel: boolean;
}) {
  const { isPending, run } = useAction();
  const { escrevendo, escrever } = useEscreverComIA();
  const [perguntas, setPerguntas] = useState<PerguntasIA>(PERGUNTAS_VAZIAS);
  const [canalId, setCanalId] = useState(canais[0]?.id ?? "");
  const canal = canais.find((c) => c.id === canalId) ?? canais[0];

  if (!canal) {
    return (
      <Card title="Títulos e descrições">
        <p className="text-sm text-ink-muted">
          Cadastre canais de venda em{" "}
          <Link href="/configuracoes" className="text-brand-text hover:underline">
            Configurações
          </Link>{" "}
          para escrever um anúncio diferente para cada canal.
        </p>
      </Card>
    );
  }

  const versoes = anuncios.filter((a) => a.canal_id === canal.id);

  function nova(sugerir: boolean) {
    const sugestao = sugerir ? gerarAnuncio(dados, canal.nome, { estilo: versoes.length }) : { titulo: "", descricao: "" };
    run(() =>
      salvarVersaoAnuncio({
        id: null,
        produtoId,
        canalId: canal.id,
        variacaoId: null,
        titulo: sugestao.titulo,
        descricao: sugestao.descricao,
      }),
    );
  }

  function novaComIA() {
    escrever({ produtoId, canalId: canal.id, variacaoId: null, perguntas }, (texto) =>
      run(() =>
        salvarVersaoAnuncio({ id: null, produtoId, canalId: canal.id, variacaoId: null, ...texto }),
      ),
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Card title="Títulos e descrições" description="Uma versão por canal. Ajuste, copie e publique.">
        <div className="-mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="Canais de venda">
          {canais.map((c) => {
            const qtd = anuncios.filter((a) => a.canal_id === c.id).length;
            const ativo = c.id === canal.id;
            return (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={ativo}
                onClick={() => setCanalId(c.id)}
                className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm transition ${
                  ativo ? "bg-brand-fill font-semibold text-on-brand" : "bg-fill text-ink-2 hover:bg-fill-strong"
                }`}
              >
                {c.nome}
                {qtd > 0 && <span className="ml-1.5 text-xs opacity-80">{qtd}</span>}
              </button>
            );
          })}
        </div>

        {iaDisponivel && (
          <GeradorIA
            perguntas={perguntas}
            onChange={setPerguntas}
            onGerar={novaComIA}
            ocupado={isPending}
            escrevendo={escrevendo}
            temVersao={versoes.length > 0}
          />
        )}

        <div className="flex flex-col gap-3">
          {versoes.map((v, i) => (
            <VersaoCard
              key={v.id}
              numero={i + 1}
              produtoId={produtoId}
              canal={canal}
              versao={v}
              variacoes={variacoes}
              dados={dados}
              ia={{ disponivel: iaDisponivel, perguntas }}
            />
          ))}
          {versoes.length === 0 && !iaDisponivel && (
            <p className="text-sm text-ink-muted">Nenhuma versão para {canal.nome} ainda. Gere uma sugestão e ajuste.</p>
          )}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {!iaDisponivel && (
              <button type="button" onClick={() => nova(true)} disabled={isPending} className={btnPrimary}>
                <IconPlus width={16} height={16} /> Nova versão com sugestão
              </button>
            )}
            {iaDisponivel && (
              <button type="button" onClick={() => nova(true)} disabled={isPending} className={linkAcao}>
                Sugestão automática (sem IA)
              </button>
            )}
            <button type="button" onClick={() => nova(false)} disabled={isPending} className={linkAcao}>
              Versão em branco
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}
