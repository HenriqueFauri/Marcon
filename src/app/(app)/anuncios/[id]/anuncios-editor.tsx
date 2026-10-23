"use client";

import { useState, useTransition } from "react";
import type { ProdutoAnuncio } from "@/types/domain";
import { LIMITE_DESCRICAO, LIMITE_TITULO, gerarAnuncio } from "@/lib/anuncio";
import type { DadosAnuncio } from "@/lib/anuncio";
import { useAction } from "@/components/use-action";
import { useToast } from "@/components/toaster";
import { Card, btnGhost, btnPrimary, btnSecondary, inputClass } from "@/components/ui";
import { IconSparkles } from "@/components/icons";
import { ENTREGAS, ESTADOS, LIMITE_ACOMPANHA, LIMITE_DICA, PERGUNTAS_VAZIAS, rotuloDoEstado, type PerguntasIA } from "@/lib/ia-perguntas";
import { AutoTextarea } from "@/components/auto-textarea";
import { formatBRL } from "@/lib/format";
import { escreverAnuncioIA, salvarAnuncio } from "../actions";

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
  temAnuncio,
}: {
  perguntas: PerguntasIA;
  onChange: (p: PerguntasIA) => void;
  onGerar: () => void;
  ocupado: boolean;
  escrevendo: boolean;
  temAnuncio: boolean;
}) {
  return (
    <div className="mb-4 rounded-2xl bg-fill p-4">
      <div className="flex flex-col gap-4">
        <div>
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <label htmlFor="ia-dica" className="text-[13px] font-medium text-ink-muted">
              Conte sobre o produto
            </label>
            {perguntas.dica.length > LIMITE_DICA * 0.8 && (
              <span className="text-xs text-ink-muted">
                {perguntas.dica.length}/{LIMITE_DICA}
              </span>
            )}
          </div>
          <AutoTextarea
            id="ia-dica"
            rows={3}
            value={perguntas.dica}
            onChange={(e) => onChange({ ...perguntas, dica: e.target.value })}
            maxLength={LIMITE_DICA}
            placeholder="Cole a ficha do fornecedor ou escreva do seu jeito: material, medidas, pra que serve, o que destacar..."
            className={`${inputClass} !bg-surface`}
          />
        </div>
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
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <button type="button" onClick={onGerar} disabled={ocupado || escrevendo} className={btnPrimary}>
          <IconSparkles width={16} height={16} /> {escrevendo ? "Escrevendo..." : temAnuncio ? "Reescrever com IA" : "Escrever com IA"}
        </button>
        <span className="text-xs text-ink-muted">O que ficar em branco, a IA não diz.</span>
      </div>
    </div>
  );
}

export function AnunciosEditor({
  produtoId,
  anuncio,
  dados,
  iaDisponivel,
}: {
  produtoId: string;
  anuncio: ProdutoAnuncio | null;
  dados: DadosAnuncio;
  iaDisponivel: boolean;
}) {
  const { isPending, run } = useAction();
  const { escrevendo, escrever } = useEscreverComIA();
  const copiar = useCopiar();
  const [perguntas, setPerguntas] = useState<PerguntasIA>(PERGUNTAS_VAZIAS);
  const [titulo, setTitulo] = useState(anuncio?.titulo ?? "");
  const [descricao, setDescricao] = useState(anuncio?.descricao ?? "");
  const [estilo, setEstilo] = useState(0);
  const alterado = titulo !== (anuncio?.titulo ?? "") || descricao !== (anuncio?.descricao ?? "");
  const tituloEstourou = titulo.length > LIMITE_TITULO;

  function salvar(texto: { titulo: string; descricao: string }) {
    run(() => salvarAnuncio({ id: anuncio?.id ?? null, produtoId, variacaoId: anuncio?.variacao_id ?? null, ...texto }));
  }

  function sugerir() {
    const sugestao = gerarAnuncio(dados, { estilo, estado: rotuloDoEstado(perguntas.estado) });
    setEstilo((e) => e + 1);
    setTitulo(sugestao.titulo);
    setDescricao(sugestao.descricao);
  }

  // O texto da IA custa uma escrita da cota: sem anúncio salvo ele já vai direto para o banco; com anúncio,
  // entra nos campos e só substitui o texto salvo quando a pessoa tocar em Salvar.
  function escreverComIA() {
    escrever({ produtoId, perguntas }, (texto) => {
      setTitulo(texto.titulo);
      setDescricao(texto.descricao);
      if (!anuncio) salvar(texto);
    });
  }

  return (
    <Card title="Anúncio">
      <p className="mb-4 text-sm text-ink-muted">
        Um texto só, que serve em qualquer plataforma: Marketplace, OLX, Mercado Livre, Shopee, Instagram ou WhatsApp. É só copiar e colar.
      </p>

      <div className="mb-4 flex flex-col gap-4">
        <Escolha rotulo="Condição" opcoes={ESTADOS} valor={perguntas.estado} onChange={(estado) => setPerguntas({ ...perguntas, estado })} />
        <p className="text-[13px] text-ink-muted">
          Preço: <span className="font-medium text-ink">{formatBRL(dados.precoVarejo)}</span> (o do cadastro do produto)
        </p>
      </div>

      {iaDisponivel && (
        <GeradorIA
          perguntas={perguntas}
          onChange={setPerguntas}
          onGerar={escreverComIA}
          ocupado={isPending}
          escrevendo={escrevendo}
          temAnuncio={!!anuncio}
        />
      )}

      <div className="flex flex-col gap-4">
        <div>
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <label htmlFor="anuncio-titulo" className="text-[13px] font-medium text-ink-muted">
              Título
            </label>
            <span className="flex items-baseline gap-3 text-xs">
              <span className={tituloEstourou ? "text-danger" : "text-ink-muted"}>{titulo.length}/{LIMITE_TITULO}</span>
              <button type="button" disabled={!titulo} onClick={() => copiar(titulo, "Título")} className={linkAcao}>
                Copiar
              </button>
            </span>
          </div>
          <AutoTextarea umaLinha id="anuncio-titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Título do anúncio" className={inputClass} />
          {tituloEstourou && <p className="mt-1 text-xs text-danger">Título curto funciona em todas as plataformas: tente até {LIMITE_TITULO} caracteres.</p>}
        </div>

        <div>
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <label htmlFor="anuncio-descricao" className="text-[13px] font-medium text-ink-muted">
              Descrição
            </label>
            <span className="flex items-baseline gap-3 text-xs">
              <span className={descricao.length > LIMITE_DESCRICAO ? "text-danger" : "text-ink-muted"}>{descricao.length}/{LIMITE_DESCRICAO}</span>
              <button type="button" disabled={!descricao} onClick={() => copiar(descricao, "Descrição")} className={linkAcao}>
                Copiar
              </button>
            </span>
          </div>
          <AutoTextarea id="anuncio-descricao" value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={6} placeholder="Descrição do anúncio" className={inputClass} />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!titulo && !descricao}
            onClick={() => copiar([titulo, descricao].filter(Boolean).join("\n\n"), "Anúncio")}
            className={`${btnSecondary} px-4 py-1.5 text-sm`}
          >
            Copiar tudo
          </button>
          <button type="button" onClick={sugerir} className={`${btnGhost} px-3 py-1 text-xs`}>
            {anuncio || titulo || descricao ? "Outra sugestão (sem IA)" : "Gerar sugestão (sem IA)"}
          </button>
        </div>
        {alterado ? (
          <button type="button" onClick={() => salvar({ titulo, descricao })} disabled={isPending} className={`${btnPrimary} px-4 py-1.5 text-sm`}>
            {isPending ? "Salvando..." : "Salvar anúncio"}
          </button>
        ) : (
          <span className="text-xs text-ink-muted">{anuncio ? "Salvo" : ""}</span>
        )}
      </div>
    </Card>
  );
}
