"use client";

import { useState, useTransition } from "react";
import type { ProdutoAnuncio } from "@/types/domain";
import { LIMITE_DESCRICAO, LIMITE_TITULO, gerarAnuncio } from "@/lib/anuncio";
import type { DadosAnuncio } from "@/lib/anuncio";
import { useAction } from "@/components/use-action";
import { useToast } from "@/components/toaster";
import { Card, btnGhost, btnPrimary, btnSecondary, inputClass } from "@/components/ui";
import { IconSparkles } from "@/components/icons";
import { RotuloAcao } from "@/components/rotulo-acao";
import { ENTREGAS, ESTADOS, LIMITE_ACOMPANHA, LIMITE_DICA, PERGUNTAS_VAZIAS, rotuloDoEstado, type PerguntasIA } from "@/lib/ia-perguntas";
import { AutoTextarea } from "@/components/auto-textarea";
import { formatBRL } from "@/lib/format";
import { escreverAnuncioIA, salvarAnuncio } from "../actions";
import { TituloPasso } from "./passo";

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
            ? "Anúncio escrito. Revise no passo 3."
            : `Anúncio escrito. Revise no passo 3. Restam ${r.restantes} escrita(s) com IA este mês.`,
        );
      } catch {
        toast.error("A IA não conseguiu escrever agora. Tente de novo.");
      }
    });
  }

  return { escrevendo, escrever };
}

const linkAcao = "text-[13px] font-medium text-brand-text hover:underline disabled:opacity-40 disabled:no-underline";
const rotuloClass = "mb-1.5 block text-[13px] font-medium text-ink-muted";

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
      <p className={rotuloClass}>{rotulo}</p>
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
                marcada ? "bg-brand-fill font-semibold text-on-brand" : "bg-fill text-ink-2 hover:bg-fill-strong"
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

// Um campo do texto final, com contador e "Copiar" ao lado do rótulo.
function CampoTexto({
  id,
  rotulo,
  valor,
  limite,
  onChange,
  onCopiar,
  children,
}: {
  id: string;
  rotulo: string;
  valor: string;
  limite: number;
  onChange: (v: string) => void;
  onCopiar: () => void;
  children: (props: { id: string; value: string; onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void }) => React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-[13px] font-medium text-ink-muted">
          {rotulo}
        </label>
        <span className="flex items-baseline gap-3">
          <span className={`text-xs ${valor.length > limite ? "text-danger" : "text-ink-muted"}`}>
            {valor.length}/{limite}
          </span>
          <button type="button" disabled={!valor} onClick={onCopiar} className={linkAcao}>
            Copiar
          </button>
        </span>
      </div>
      {children({ id, value: valor, onChange: (e) => onChange(e.target.value) })}
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
  // entra nos campos e só substitui o texto salvo quando a pessoa tocar em Salvar.
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

  return (
    <>
      <Card
        title={
          <TituloPasso n={2} feito={!!anuncio}>
            Escreva o texto
          </TituloPasso>
        }
        rodape={iaDisponivel ? "O que ficar em branco, a IA não inventa." : undefined}
      >
        <div className="flex flex-col gap-5">
          <Escolha rotulo="Condição" opcoes={ESTADOS} valor={perguntas.estado} onChange={(estado) => setPerguntas({ ...perguntas, estado })} />

          {iaDisponivel && (
            <>
              <div>
                <label htmlFor="ia-dica" className={rotuloClass}>
                  Conte sobre o produto
                </label>
                <AutoTextarea
                  id="ia-dica"
                  rows={3}
                  value={perguntas.dica}
                  onChange={(e) => setPerguntas({ ...perguntas, dica: e.target.value })}
                  maxLength={LIMITE_DICA}
                  placeholder="Material, medidas, pra que serve, o que destacar. Pode colar a ficha do fornecedor."
                  className={inputClass}
                />
              </div>

              <details className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between text-[15px] text-ink [&::-webkit-details-marker]:hidden">
                  Entrega e o que acompanha
                  <span className="text-[13px] text-ink-muted">
                    opcional <span className="inline-block transition group-open:rotate-90">›</span>
                  </span>
                </summary>
                <div className="mt-4 flex flex-col gap-4">
                  <Escolha
                    rotulo="Retirada e entrega"
                    opcoes={ENTREGAS}
                    valor={perguntas.entrega}
                    onChange={(entrega) => setPerguntas({ ...perguntas, entrega })}
                  />
                  <div>
                    <label htmlFor="ia-acompanha" className={rotuloClass}>
                      O que acompanha
                    </label>
                    <input
                      id="ia-acompanha"
                      value={perguntas.acompanha}
                      onChange={(e) => setPerguntas({ ...perguntas, acompanha: e.target.value })}
                      maxLength={LIMITE_ACOMPANHA}
                      placeholder="Caixa, cabo, manual..."
                      className={inputClass}
                    />
                  </div>
                </div>
              </details>
            </>
          )}

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {iaDisponivel ? (
              <>
                <button type="button" onClick={escreverComIA} disabled={isPending || escrevendo} className={`${btnPrimary} w-full sm:w-auto`}>
                  <IconSparkles width={16} height={16} />
                  <RotuloAcao pendente={escrevendo} ocupado="Escrevendo...">
                    {anuncio ? "Reescrever com IA" : "Escrever com IA"}
                  </RotuloAcao>
                </button>
                <button type="button" onClick={sugerir} className={`${btnGhost} w-full text-sm sm:w-auto`}>
                  {temTexto ? "Outro modelo, sem IA" : "Usar um modelo, sem IA"}
                </button>
              </>
            ) : (
              <button type="button" onClick={sugerir} className={`${btnPrimary} w-full sm:w-auto`}>
                {temTexto ? "Gerar outro texto" : "Gerar texto"}
              </button>
            )}
          </div>
        </div>
      </Card>

      <Card
        title={<TituloPasso n={3}>Copie e publique</TituloPasso>}
        rodape={
          <>
            Serve em qualquer lugar: Marketplace, OLX, Mercado Livre, Shopee, Instagram ou Zap. O preço ({formatBRL(dados.precoVarejo)}) vai no
            campo de preço da plataforma.
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <CampoTexto
            id="anuncio-titulo"
            rotulo="Título"
            valor={titulo}
            limite={LIMITE_TITULO}
            onChange={setTitulo}
            onCopiar={() => copiar(titulo, "Título")}
          >
            {(p) => <AutoTextarea umaLinha {...p} placeholder="Escreva no passo 2 ou digite aqui" className={inputClass} />}
          </CampoTexto>
          <CampoTexto
            id="anuncio-descricao"
            rotulo="Descrição"
            valor={descricao}
            limite={LIMITE_DESCRICAO}
            onChange={setDescricao}
            onCopiar={() => copiar(descricao, "Descrição")}
          >
            {(p) => <AutoTextarea {...p} rows={6} placeholder="Descrição do anúncio" className={inputClass} />}
          </CampoTexto>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <button type="button" disabled={!temTexto} onClick={copiarTudo} className={`${btnPrimary} w-full sm:w-auto`}>
              Copiar anúncio
            </button>
            {alterado ? (
              <button type="button" onClick={() => salvar({ titulo, descricao })} disabled={isPending} className={`${btnSecondary} w-full sm:w-auto`}>
                <RotuloAcao pendente={isPending} ocupado="Salvando...">
                  Salvar alterações
                </RotuloAcao>
              </button>
            ) : (
              anuncio && <span className="text-center text-[13px] text-ink-muted sm:text-left">Texto salvo</span>
            )}
          </div>
        </div>
      </Card>
    </>
  );
}
