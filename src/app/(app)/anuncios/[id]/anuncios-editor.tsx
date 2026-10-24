"use client";

import { useState, useTransition, type ReactNode } from "react";
import type { ProdutoAnuncio } from "@/types/domain";
import { LIMITE_DESCRICAO, LIMITE_TITULO, gerarAnuncio } from "@/lib/anuncio";
import type { DadosAnuncio } from "@/lib/anuncio";
import { useAction } from "@/components/use-action";
import { useToast } from "@/components/toaster";
import { btnGhost, btnPrimary, btnSecondary, btnSmallNeutro } from "@/components/ui";
import { Grupo } from "@/components/ajustes";
import { Modal } from "@/components/modal";
import { IconCheck, IconSparkles } from "@/components/icons";
import { RotuloAcao } from "@/components/rotulo-acao";
import { ENTREGAS, ESTADOS, LIMITE_ACOMPANHA, LIMITE_DICA, PERGUNTAS_VAZIAS, rotuloDoEstado, type PerguntasIA } from "@/lib/ia-perguntas";
import { AutoTextarea } from "@/components/auto-textarea";
import { escreverAnuncioIA, salvarAnuncio } from "../actions";

function useCopiar() {
  const toast = useToast();
  return async function copiar(texto: string, rotulo: string) {
    try {
      await navigator.clipboard.writeText(texto);
      toast.success(`${rotulo} copiado. Agora é só colar.`);
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
            ? "Anúncio escrito. Dê uma revisada."
            : `Anúncio escrito. Dê uma revisada. ${r.restantes === 1 ? "Resta 1 escrita" : `Restam ${r.restantes} escritas`} com IA este mês.`,
        );
      } catch {
        toast.error("A IA não conseguiu escrever agora. Tente de novo.");
      }
    });
  }

  return { escrevendo, escrever };
}

const linhaClass = "flex items-center gap-3 border-t border-line px-4 py-3 text-[17px] first:border-t-0";
const campoLinhaClass = "min-w-0 bg-transparent text-[17px] text-ink outline-none placeholder:text-ink-faint";

// Linha com o valor à direita e "›": abre uma folha com a lista de opções (mais de 4, ou rótulos longos).
function LinhaEscolha({
  rotulo,
  opcoes,
  valor,
  onChange,
}: {
  rotulo: string;
  opcoes: readonly { id: string; rotulo: string; curto: string }[];
  valor: string;
  onChange: (id: string) => void;
}) {
  const [aberta, setAberta] = useState(false);
  const atual = opcoes.find((o) => o.id === valor);
  const escolher = (id: string) => {
    onChange(id);
    setAberta(false);
  };
  return (
    <>
      <button type="button" onClick={() => setAberta(true)} className={`${linhaClass} w-full text-left transition hover:bg-fill/60 active:bg-fill`}>
        <span className="min-w-0 flex-1 truncate text-ink">{rotulo}</span>
        <span className={`max-w-[55%] truncate ${atual ? "text-ink-muted" : "text-ink-faint"}`}>{atual?.curto ?? "Escolher"}</span>
        <span aria-hidden="true" className="text-lg text-ink-faint">
          ›
        </span>
      </button>
      <Modal open={aberta} onClose={() => setAberta(false)} title={rotulo} size="sm" folha>
        <div role="radiogroup" aria-label={rotulo} className="hairline overflow-hidden rounded-2xl">
          {[...opcoes, { id: "", rotulo: "Não informar", curto: "" }].map((o) => {
            const marcada = o.id === valor;
            return (
              <button
                key={o.id || "nada"}
                type="button"
                role="radio"
                aria-checked={marcada}
                onClick={() => escolher(o.id)}
                className={`${linhaClass} w-full text-left transition hover:bg-fill/60 active:bg-fill`}
              >
                <span className={`min-w-0 flex-1 ${o.id ? "text-ink" : "text-ink-muted"}`}>{o.rotulo}</span>
                {marcada && <IconCheck width={18} height={18} className="shrink-0 text-brand-text" />}
              </button>
            );
          })}
        </div>
      </Modal>
    </>
  );
}

// Um campo do texto final: rótulo, contador e "Copiar" na linha de cima, o texto embaixo.
function CampoTexto({
  id,
  rotulo,
  valor,
  limite,
  onCopiar,
  children,
}: {
  id: string;
  rotulo: string;
  valor: string;
  limite: number;
  onCopiar: () => void;
  children: ReactNode;
}) {
  return (
    <div className="border-t border-line px-4 py-3 first:border-t-0">
      <div className="mb-1 flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-[13px] text-ink-muted">
          {rotulo}
        </label>
        <span className="flex items-center gap-3">
          <span className={`text-[13px] tabular-nums ${valor.length > limite ? "text-danger" : "text-ink-muted"}`}>
            {valor.length}/{limite}
          </span>
          <button type="button" disabled={!valor} onClick={onCopiar} className={btnSmallNeutro}>
            Copiar
          </button>
        </span>
      </div>
      {children}
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
  const temTexto = !!(titulo || descricao);

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
  // entra nos campos e só substitui o texto salvo quando a pessoa copiar ou salvar.
  function escreverComIA() {
    escrever({ produtoId, perguntas }, (texto) => {
      setTitulo(texto.titulo);
      setDescricao(texto.descricao);
      if (!anuncio) salvar(texto);
    });
  }

  // copiar o anúncio inteiro já guarda o que mudou, pra ninguém perder o texto
  function copiarTudo() {
    void copiar([titulo, descricao].filter(Boolean).join("\n\n"), "Anúncio");
    if (alterado) salvar({ titulo, descricao });
  }

  const ocupado = isPending || escrevendo;

  // botão que escreve o texto: principal (barra de baixo) enquanto não há texto, secundário depois
  const botaoEscrever = (classe: string) =>
    iaDisponivel ? (
      <button type="button" onClick={escreverComIA} disabled={ocupado} className={classe}>
        <IconSparkles width={16} height={16} />
        <RotuloAcao pendente={escrevendo} ocupado="Escrevendo...">
          {temTexto ? "Reescrever com IA" : "Escrever com IA"}
        </RotuloAcao>
      </button>
    ) : (
      <button type="button" onClick={sugerir} className={classe}>
        {temTexto ? "Gerar outro texto" : "Gerar texto"}
      </button>
    );

  return (
    <>
      <Grupo titulo="Sobre o produto" rodape={iaDisponivel ? "O que ficar em branco, a IA não inventa." : undefined} semPadding>
        <LinhaEscolha rotulo="Condição" opcoes={ESTADOS} valor={perguntas.estado} onChange={(estado) => setPerguntas({ ...perguntas, estado })} />
        {iaDisponivel && (
          <>
            <LinhaEscolha rotulo="Entrega" opcoes={ENTREGAS} valor={perguntas.entrega} onChange={(entrega) => setPerguntas({ ...perguntas, entrega })} />
            <label className={linhaClass}>
              <span className="shrink-0 text-ink">O que acompanha</span>
              <input
                value={perguntas.acompanha}
                onChange={(e) => setPerguntas({ ...perguntas, acompanha: e.target.value })}
                maxLength={LIMITE_ACOMPANHA}
                placeholder="Caixa, cabo..."
                className={`${campoLinhaClass} flex-1 text-right`}
              />
            </label>
            <div className="border-t border-line px-4 py-3">
              <AutoTextarea
                aria-label="Conte sobre o produto"
                rows={3}
                value={perguntas.dica}
                onChange={(e) => setPerguntas({ ...perguntas, dica: e.target.value })}
                maxLength={LIMITE_DICA}
                placeholder="Conte sobre o produto: material, medidas, pra que serve. Pode colar a ficha do fornecedor."
                className={`${campoLinhaClass} block w-full resize-none`}
              />
            </div>
          </>
        )}
        {temTexto && <div className="border-t border-line p-4">{botaoEscrever(`${btnSecondary} w-full`)}</div>}
        {iaDisponivel && (
          <div className={`flex justify-center px-4 pb-3 ${temTexto ? "" : "border-t border-line pt-3"}`}>
            <button type="button" onClick={sugerir} className="text-[15px] font-medium text-brand-text hover:underline">
              {temTexto ? "Outro modelo, sem IA" : "Usar um modelo, sem IA"}
            </button>
          </div>
        )}
      </Grupo>

      <Grupo titulo="Anúncio" rodape="Serve no Marketplace e no Zap. O preço vai no campo de preço." semPadding>
        <CampoTexto id="anuncio-titulo" rotulo="Título" valor={titulo} limite={LIMITE_TITULO} onCopiar={() => copiar(titulo, "Título")}>
          <AutoTextarea
            id="anuncio-titulo"
            umaLinha
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Título do anúncio"
            className={`${campoLinhaClass} block w-full resize-none`}
          />
        </CampoTexto>
        <CampoTexto id="anuncio-descricao" rotulo="Descrição" valor={descricao} limite={LIMITE_DESCRICAO} onCopiar={() => copiar(descricao, "Descrição")}>
          <AutoTextarea
            id="anuncio-descricao"
            rows={6}
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Descrição do anúncio"
            className={`${campoLinhaClass} block w-full resize-none`}
          />
        </CampoTexto>
      </Grupo>

      {/* um só botão principal: fixo acima da barra de abas no celular, normal no computador */}
      <div className="fixed inset-x-0 bottom-[calc(max(1.25rem,env(safe-area-inset-bottom))+4.5rem)] z-30 bg-gradient-to-t from-canvas via-canvas/90 to-transparent px-4 pb-2 pt-6 lg:static lg:bg-none lg:p-0">
        <div className="mx-auto flex max-w-4xl flex-col items-center gap-1 lg:flex-row lg:gap-3">
          {temTexto ? (
            <button
              type="button"
              onClick={copiarTudo}
              disabled={isPending}
              className={`${btnPrimary} h-[54px] w-full !text-[17px] shadow-lg shadow-brand/30 lg:h-auto lg:w-auto lg:py-3 lg:shadow-sm`}
            >
              Copiar anúncio
            </button>
          ) : (
            botaoEscrever(`${btnPrimary} h-[54px] w-full !text-[17px] shadow-lg shadow-brand/30 lg:h-auto lg:w-auto lg:py-3 lg:shadow-sm`)
          )}
          {alterado && (
            <button type="button" onClick={() => salvar({ titulo, descricao })} disabled={isPending} className={`${btnGhost} py-1.5 lg:py-2.5`}>
              <RotuloAcao pendente={isPending} ocupado="Salvando...">
                Salvar alterações
              </RotuloAcao>
            </button>
          )}
        </div>
      </div>
    </>
  );
}
