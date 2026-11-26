"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Grupo } from "@/components/ajustes";
import { ConfirmButton } from "@/components/confirm-button";
import { RotuloAcao } from "@/components/rotulo-acao";
import { useAction } from "@/components/use-action";
import { EmptyState, Field, PageHeader, btnGhost, btnIcon, btnPrimary, btnSecondary, btnSmallNeutro, inputClass } from "@/components/ui";
import {
  LIMITE_ATALHO,
  LIMITE_TEXTO,
  LIMITE_TITULO,
  VARIAVEIS,
  normalizarAtalho,
  preencherVariaveis,
  variaveisSemValor,
  type DadosDaConta,
  type RespostaPronta,
} from "@/lib/respostas";
import { apagarResposta, criarExemplos, reordenarRespostas, salvarResposta } from "./actions";

const BASE = "/configuracoes/respostas";
const VOLTAR = { href: "/configuracoes", label: "Configurações" };

function Seta({ para }: { para: "cima" | "baixo" }) {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={para === "cima" ? "m6 15 6-6 6 6" : "m6 9 6 6 6-6"} />
    </svg>
  );
}

function lista(rotulos: string[]) {
  if (rotulos.length <= 1) return rotulos.join("");
  return `${rotulos.slice(0, -1).join(", ")} e ${rotulos[rotulos.length - 1]}`;
}

export function RespostasProntas({
  respostas,
  dados,
  editando,
}: {
  respostas: RespostaPronta[];
  dados: DadosDaConta;
  // undefined: lista. null: nova. resposta: edição.
  editando?: RespostaPronta | null;
}) {
  if (editando !== undefined) return <Editor resposta={editando} dados={dados} />;
  // a chave muda quando a lista do servidor muda (salvou, apagou, reordenou): o estado local recomeça dela
  return <Lista key={respostas.map((r) => `${r.id}:${r.ordem}`).join(",")} respostas={respostas} dados={dados} />;
}

function Lista({ respostas, dados }: { respostas: RespostaPronta[]; dados: DadosDaConta }) {
  const { isPending, run } = useAction();
  const [ordem, setOrdem] = useState(respostas);

  function mover(i: number, delta: -1 | 1) {
    const j = i + delta;
    if (j < 0 || j >= ordem.length) return;
    const nova = [...ordem];
    [nova[i], nova[j]] = [nova[j], nova[i]];
    setOrdem(nova);
    run(() => reordenarRespostas(nova.map((r) => r.id)), { onError: () => setOrdem(respostas) });
  }

  if (ordem.length === 0) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Respostas prontas" back={VOLTAR} />
        <EmptyState
          title="Nenhuma resposta pronta"
          description="Comece com 7 exemplos: saudação, retirada, entrega, formas de pagamento, Pix, ainda disponível e agradecimento. Dá pra editar tudo."
          action={
            <>
              <button type="button" disabled={isPending} onClick={() => run(criarExemplos)} className={btnPrimary}>
                <RotuloAcao pendente={isPending} ocupado="Criando...">
                  Criar exemplos prontos
                </RotuloAcao>
              </button>
              <Link href={`${BASE}?nova=1`} className={btnSecondary}>
                Escrever do zero
              </Link>
            </>
          }
        />
      </div>
    );
  }

  const titulo = ordem.length === 1 ? "1 resposta" : `${ordem.length} respostas`;
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Respostas prontas"
        back={VOLTAR}
        action={
          <Link href={`${BASE}?nova=1`} className={btnPrimary}>
            Nova resposta
          </Link>
        }
      />
      <Grupo titulo={titulo} semPadding rodape="Na extensão do WhatsApp Web, Inserir coloca o texto na conversa aberta. Quem envia é você.">
        {ordem.map((r, i) => {
          const previa = preencherVariaveis(r.texto, dados).replace(/\s+/g, " ");
          return (
            <div key={r.id} className="flex items-center gap-1 border-t border-line pr-2 first:border-t-0">
              <Link
                href={`${BASE}?editar=${r.id}`}
                className="flex min-w-0 flex-1 flex-col gap-0.5 px-4 py-3 transition hover:bg-fill/60 active:bg-fill"
              >
                <span className="truncate text-[17px] text-ink">{r.titulo}</span>
                <span className="line-clamp-2 text-[13px] leading-snug text-ink-muted">
                  {r.atalho && <span className="font-medium text-ink-2">/{r.atalho} · </span>}
                  {previa || "Nada"}
                </span>
              </Link>
              <div className="flex shrink-0 flex-col sm:flex-row">
                <button
                  type="button"
                  onClick={() => mover(i, -1)}
                  disabled={i === 0 || isPending}
                  aria-label={`Subir ${r.titulo}`}
                  className={`${btnIcon} disabled:invisible`}
                >
                  <Seta para="cima" />
                </button>
                <button
                  type="button"
                  onClick={() => mover(i, 1)}
                  disabled={i === ordem.length - 1 || isPending}
                  aria-label={`Descer ${r.titulo}`}
                  className={`${btnIcon} disabled:invisible`}
                >
                  <Seta para="baixo" />
                </button>
              </div>
            </div>
          );
        })}
      </Grupo>
    </div>
  );
}

function Editor({ resposta, dados }: { resposta: RespostaPronta | null; dados: DadosDaConta }) {
  const router = useRouter();
  const { isPending, run } = useAction();
  const [titulo, setTitulo] = useState(resposta?.titulo ?? "");
  const [atalho, setAtalho] = useState(resposta?.atalho ?? "");
  const [texto, setTexto] = useState(resposta?.texto ?? "");
  const caixa = useRef<HTMLTextAreaElement>(null);

  const previa = preencherVariaveis(texto, dados);
  const semValor = variaveisSemValor(texto, dados).map((c) => VARIAVEIS.find((v) => v.chave === c)!.rotulo);

  function inserirVariavel(chave: string) {
    const el = caixa.current;
    const marca = `{${chave}}`;
    const ini = el?.selectionStart ?? texto.length;
    const fim = el?.selectionEnd ?? texto.length;
    const novo = (texto.slice(0, ini) + marca + texto.slice(fim)).slice(0, LIMITE_TEXTO);
    setTexto(novo);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(ini + marca.length, ini + marca.length);
    });
  }

  function salvar(formData: FormData) {
    run(() => salvarResposta(formData), {
      onSuccess: () => {
        router.push(BASE);
        router.refresh();
      },
    });
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={resposta ? resposta.titulo : "Nova resposta"} back={{ href: BASE, label: "Respostas prontas" }} />
      <form action={salvar} className="flex flex-col gap-7">
        {resposta && <input type="hidden" name="id" value={resposta.id} />}
        <Grupo titulo="Resposta">
          <Field label="Título">
            <input
              name="titulo"
              required
              maxLength={LIMITE_TITULO}
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex: Pix, Entrega, Saudação"
              className={inputClass}
            />
          </Field>
          <Field label="Atalho" hint="Opcional. Na extensão, busque por /atalho.">
            <div className="flex items-center gap-1 rounded-xl bg-fill pl-3.5 focus-within:ring-4 focus-within:ring-brand/15">
              <span className="text-[15px] text-ink-muted" aria-hidden="true">
                /
              </span>
              <input
                name="atalho"
                value={atalho}
                maxLength={LIMITE_ATALHO + 1}
                onChange={(e) => setAtalho(normalizarAtalho(e.target.value))}
                placeholder="pix"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                aria-label="Atalho"
                className={`${inputClass} pl-0 focus:ring-0`}
              />
            </div>
          </Field>
          <Field label="Texto" hint={`${texto.length} de ${LIMITE_TEXTO}`}>
            <textarea
              ref={caixa}
              name="texto"
              required
              rows={6}
              maxLength={LIMITE_TEXTO}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Oi! Aqui é da {negocio}. Como posso te ajudar?"
              className={`${inputClass} min-h-40 resize-y leading-snug`}
            />
          </Field>
          <div>
            <p className="mb-1.5 text-[13px] font-medium text-ink-muted">Colocar no texto</p>
            <div className="flex flex-wrap gap-1.5">
              {VARIAVEIS.map((v) => (
                <button key={v.chave} type="button" onClick={() => inserirVariavel(v.chave)} className={btnSmallNeutro}>
                  + {v.rotulo}
                </button>
              ))}
            </div>
          </div>
        </Grupo>

        <Grupo
          titulo="Prévia"
          rodape={
            semValor.length > 0 ? (
              <>
                A conta não tem {lista(semValor)}: a linha some do texto. Preencha em{" "}
                <Link href="/configuracoes" className="text-brand-text hover:opacity-80">
                  Configurações
                </Link>
                {semValor.includes("Link da vitrine") ? " ou ligue a Vitrine" : ""}.
              </>
            ) : (
              "Assim o texto entra na conversa."
            )
          }
        >
          <p className="whitespace-pre-wrap break-words text-[15px] leading-snug text-ink">{previa || <span className="text-ink-muted">Nada</span>}</p>
        </Grupo>

        <div className="flex flex-col gap-2 sm:flex-row">
          <button type="submit" disabled={isPending} className={`${btnPrimary} w-full sm:w-auto`}>
            <RotuloAcao pendente={isPending} ocupado="Salvando...">
              Salvar
            </RotuloAcao>
          </button>
          <Link href={BASE} className={`${btnGhost} w-full sm:w-auto`}>
            Cancelar
          </Link>
        </div>
      </form>

      {resposta && (
        <div className="mt-10 px-4">
          <ConfirmButton
            title={`Apagar “${resposta.titulo}”?`}
            description="A resposta sai do app e da extensão."
            confirmLabel="Apagar"
            successMessage="Resposta apagada."
            onConfirm={() => apagarResposta(resposta.id)}
            onDone={() => {
              router.push(BASE);
              router.refresh();
            }}
            className="text-[15px] text-danger hover:opacity-80"
          >
            Apagar resposta
          </ConfirmButton>
        </div>
      )}
    </div>
  );
}
