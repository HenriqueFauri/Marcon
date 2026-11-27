"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Grupo, Segmentado } from "@/components/ajustes";
import { ConfirmButton } from "@/components/confirm-button";
import { RotuloAcao } from "@/components/rotulo-acao";
import { useAction } from "@/components/use-action";
import { EmptyState, Field, PageHeader, btnGhost, btnIcon, btnPrimary, btnSecondary, btnSmallNeutro, inputClass } from "@/components/ui";
import { ROTULO_TIPO } from "@/lib/midias";
import { VARIAVEIS, preencherVariaveis, variaveisSemValor, type DadosDaConta } from "@/lib/respostas";
import {
  LIMITE_PASSOS,
  LIMITE_SEQUENCIAS,
  LIMITE_TEXTO_PASSO,
  LIMITE_TITULO_SEQUENCIA,
  detalheDoPasso,
  passoVazio,
  textoDoPasso,
  tituloDoPasso,
  type MidiaResumo,
  type PassoSequencia,
  type RespostaResumo,
  type Sequencia,
} from "@/lib/sequencias";
import { apagarPasso, apagarSequencia, reordenarPassos, reordenarSequencias, salvarPasso, salvarSequencia } from "./actions";

const BASE = "/configuracoes/sequencias";
const VOLTAR = { href: "/configuracoes", label: "Configurações" };

type Modo =
  | { tela: "lista" }
  | { tela: "nova" }
  | { tela: "sequencia"; sequencia: Sequencia }
  | { tela: "passo"; sequencia: Sequencia; passo: PassoSequencia | null; numero: number };

interface Props {
  modo: Modo;
  sequencias: Sequencia[];
  passos: PassoSequencia[];
  respostas: RespostaResumo[];
  midias: MidiaResumo[];
  dados: DadosDaConta;
}

function plural(n: number, um: string, varios: string) {
  return n === 1 ? `1 ${um}` : `${n} ${varios}`;
}

function Seta({ para }: { para: "cima" | "baixo" }) {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={para === "cima" ? "m6 15 6-6 6 6" : "m6 9 6 6 6-6"} />
    </svg>
  );
}

// subir e descer da linha (como em Respostas prontas)
function Setas({ nome, i, total, desligado, mover }: { nome: string; i: number; total: number; desligado: boolean; mover: (i: number, d: -1 | 1) => void }) {
  return (
    <div className="flex shrink-0 flex-col sm:flex-row">
      <button type="button" onClick={() => mover(i, -1)} disabled={i === 0 || desligado} aria-label={`Subir ${nome}`} className={`${btnIcon} disabled:invisible`}>
        <Seta para="cima" />
      </button>
      <button type="button" onClick={() => mover(i, 1)} disabled={i === total - 1 || desligado} aria-label={`Descer ${nome}`} className={`${btnIcon} disabled:invisible`}>
        <Seta para="baixo" />
      </button>
    </div>
  );
}

export function Sequencias(props: Props) {
  const { modo } = props;
  if (modo.tela === "nova") return <NovaSequencia />;
  if (modo.tela === "sequencia") {
    return <DetalheSequencia key={props.passos.map((p) => `${p.id}:${p.ordem}`).join(",")} {...props} sequencia={modo.sequencia} />;
  }
  if (modo.tela === "passo") return <EditorPasso {...props} sequencia={modo.sequencia} passo={modo.passo} numero={modo.numero} />;
  return <Lista key={props.sequencias.map((s) => `${s.id}:${s.ordem}`).join(",")} {...props} />;
}

// ---------------------------------------------------------------------------------------------

function Lista({ sequencias, passos }: Props) {
  const { isPending, run } = useAction();
  const [ordem, setOrdem] = useState(sequencias);

  function mover(i: number, delta: -1 | 1) {
    const j = i + delta;
    if (j < 0 || j >= ordem.length) return;
    const nova = [...ordem];
    [nova[i], nova[j]] = [nova[j], nova[i]];
    setOrdem(nova);
    run(() => reordenarSequencias(nova.map((s) => s.id)), { onError: () => setOrdem(sequencias) });
  }

  if (ordem.length === 0) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Sequências" back={VOLTAR} />
        <EmptyState
          title="Nenhuma sequência"
          description="Junte textos, fotos e áudios na ordem do atendimento, como boas-vindas, catálogo e Pix. Na extensão, cada clique põe o próximo na conversa."
          action={
            <Link href={`${BASE}?nova=1`} className={btnPrimary}>
              Criar sequência
            </Link>
          }
        />
      </div>
    );
  }

  const cheio = ordem.length >= LIMITE_SEQUENCIAS;
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Sequências"
        back={VOLTAR}
        action={
          cheio ? undefined : (
            <Link href={`${BASE}?nova=1`} className={btnPrimary}>
              Nova sequência
            </Link>
          )
        }
      />
      <Grupo
        titulo={plural(ordem.length, "sequência", "sequências")}
        semPadding
        rodape={
          cheio
            ? `Limite de ${LIMITE_SEQUENCIAS} sequências. Apague uma para criar outra.`
            : "Na extensão do WhatsApp Web, aba Respostas, cada clique põe o próximo passo na conversa. Quem envia é você."
        }
      >
        {ordem.map((s, i) => {
          const n = passos.filter((p) => p.sequencia_id === s.id).length;
          return (
            <div key={s.id} className="flex items-center gap-1 border-t border-line pr-2 first:border-t-0">
              <Link href={`${BASE}?editar=${s.id}`} className="flex min-w-0 flex-1 flex-col gap-0.5 px-4 py-3 transition hover:bg-fill/60 active:bg-fill">
                <span className="truncate text-[17px] text-ink">{s.titulo}</span>
                <span className="text-[13px] text-ink-muted">{n === 0 ? "Sem passos" : plural(n, "passo", "passos")}</span>
              </Link>
              <Setas nome={s.titulo} i={i} total={ordem.length} desligado={isPending} mover={mover} />
            </div>
          );
        })}
      </Grupo>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

function NovaSequencia() {
  const router = useRouter();
  const { isPending, run } = useAction();
  function salvar(formData: FormData) {
    let criada: string | undefined;
    run(
      async () => {
        const r = await salvarSequencia(formData);
        if (r.ok) criada = r.id;
        return r;
      },
      {
        onSuccess: () => {
          router.push(criada ? `${BASE}?editar=${criada}` : BASE);
          router.refresh();
        },
      },
    );
  }
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Nova sequência" back={{ href: BASE, label: "Sequências" }} />
      <form action={salvar} className="flex flex-col gap-7">
        <Grupo titulo="Sequência" rodape="Depois de criar, você monta os passos.">
          <Field label="Nome">
            <input name="titulo" required autoFocus maxLength={LIMITE_TITULO_SEQUENCIA} placeholder="Ex: Primeiro contato, Fechar venda" className={inputClass} />
          </Field>
        </Grupo>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button type="submit" disabled={isPending} className={`${btnPrimary} w-full sm:w-auto`}>
            <RotuloAcao pendente={isPending} ocupado="Criando...">
              Criar
            </RotuloAcao>
          </button>
          <Link href={BASE} className={`${btnGhost} w-full sm:w-auto`}>
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

function DetalheSequencia({ sequencia, passos, respostas, midias, dados }: Props & { sequencia: Sequencia }) {
  const router = useRouter();
  const nome = useAction();
  const ordemAcao = useAction();
  const [titulo, setTitulo] = useState(sequencia.titulo);
  const [ordem, setOrdem] = useState(() => [...passos].sort((a, b) => a.ordem - b.ordem));
  const mudouNome = titulo.replace(/\s+/g, " ").trim() !== sequencia.titulo;

  function mover(i: number, delta: -1 | 1) {
    const j = i + delta;
    if (j < 0 || j >= ordem.length) return;
    const nova = [...ordem];
    [nova[i], nova[j]] = [nova[j], nova[i]];
    setOrdem(nova);
    ordemAcao.run(() => reordenarPassos(sequencia.id, nova.map((p) => p.id)), { onError: () => setOrdem(passos) });
  }

  function salvarNome(formData: FormData) {
    nome.run(() => salvarSequencia(formData), { onSuccess: () => router.refresh() });
  }

  const preencher = (t: string) => preencherVariaveis(t, dados);
  const vazios = ordem.filter((p) => passoVazio(p, respostas, midias, preencher)).length;
  const cheio = ordem.length >= LIMITE_PASSOS;
  const aqui = `${BASE}?editar=${sequencia.id}`;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={sequencia.titulo} back={{ href: BASE, label: "Sequências" }} />
      <div className="flex flex-col gap-7">
        <form action={salvarNome}>
          <input type="hidden" name="id" value={sequencia.id} />
          <Grupo titulo="Nome">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                name="titulo"
                required
                maxLength={LIMITE_TITULO_SEQUENCIA}
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                aria-label="Nome da sequência"
                className={`${inputClass} sm:flex-1`}
              />
              {mudouNome && (
                <button type="submit" disabled={nome.isPending} className={`${btnSecondary} w-full sm:w-auto`}>
                  <RotuloAcao pendente={nome.isPending} ocupado="Salvando...">
                    Salvar nome
                  </RotuloAcao>
                </button>
              )}
            </div>
          </Grupo>
        </form>

        {ordem.length === 0 ? (
          <EmptyState
            title="Nenhum passo ainda"
            description="Cada passo é um texto, uma foto, um PDF ou um áudio, ou um texto com arquivo."
            action={
              <Link href={`${aqui}&passo=novo`} className={btnPrimary}>
                Criar primeiro passo
              </Link>
            }
          />
        ) : (
          <Grupo
            titulo={plural(ordem.length, "passo", "passos")}
            semPadding
            rodape={
              vazios > 0
                ? `${vazios === 1 ? "1 passo está vazio" : `${vazios} passos estão vazios`}: a resposta ou o arquivo foi apagado, ou o texto usa um dado que a conta não tem. Na extensão, ${vazios === 1 ? "ele é pulado" : "eles são pulados"}.`
                : "Passo com texto e arquivo: o primeiro clique insere o texto, o segundo abre a prévia do arquivo (o áudio vai como mensagem de voz, depois de confirmar a conversa)."
            }
          >
            {ordem.map((p, i) => {
              const vazio = passoVazio(p, respostas, midias, preencher);
              const detalhe = detalheDoPasso(p, respostas, midias);
              return (
                <div key={p.id} className="flex items-center gap-1 border-t border-line pr-2 first:border-t-0">
                  <Link href={`${aqui}&passo=${p.id}`} className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 transition hover:bg-fill/60 active:bg-fill">
                    <span className="w-5 shrink-0 text-right text-[15px] tabular-nums text-ink-muted">{i + 1}</span>
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className={`truncate text-[17px] ${vazio ? "text-ink-muted" : "text-ink"}`}>{tituloDoPasso(p, respostas, midias)}</span>
                      <span className={`truncate text-[13px] ${vazio ? "text-warning" : "text-ink-muted"}`}>{vazio ? "Vazio: confira o texto ou o arquivo" : detalhe}</span>
                    </span>
                  </Link>
                  <Setas nome={`passo ${i + 1}`} i={i} total={ordem.length} desligado={ordemAcao.isPending} mover={mover} />
                </div>
              );
            })}
          </Grupo>
        )}

        {ordem.length > 0 &&
          (cheio ? (
            <p className="px-4 text-[13px] text-ink-muted">Limite de {LIMITE_PASSOS} passos por sequência.</p>
          ) : (
            <Link href={`${aqui}&passo=novo`} className={`${btnPrimary} w-full sm:w-auto sm:self-start`}>
              Novo passo
            </Link>
          ))}
      </div>

      <div className="mt-10 px-4">
        <ConfirmButton
          title={`Apagar “${sequencia.titulo}”?`}
          description="A sequência e os passos saem do app e da extensão. As respostas prontas e os arquivos continuam."
          confirmLabel="Apagar"
          successMessage="Sequência apagada."
          onConfirm={() => apagarSequencia(sequencia.id)}
          onDone={() => {
            router.push(BASE);
            router.refresh();
          }}
          className="text-[15px] text-danger hover:opacity-80"
        >
          Apagar sequência
        </ConfirmButton>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

type Fonte = "escrever" | "resposta" | "nenhum";

function lista(rotulos: string[]) {
  if (rotulos.length <= 1) return rotulos.join("");
  return `${rotulos.slice(0, -1).join(", ")} e ${rotulos[rotulos.length - 1]}`;
}

function EditorPasso({
  sequencia,
  passo,
  numero,
  respostas,
  midias,
  dados,
}: Props & { sequencia: Sequencia; passo: PassoSequencia | null; numero: number }) {
  const router = useRouter();
  const { isPending, run } = useAction();
  const respostaExiste = !!passo?.resposta_id && respostas.some((r) => r.id === passo.resposta_id);
  const midiaExiste = !!passo?.midia_id && midias.some((m) => m.id === passo.midia_id);
  // passo que ficou vazio (resposta ou arquivo apagado) abre em Escrever, com aviso
  const ficouVazio = !!passo && !respostaExiste && !passo.texto && !midiaExiste;
  const [fonte, setFonte] = useState<Fonte>(passo ? (respostaExiste ? "resposta" : passo.texto || ficouVazio ? "escrever" : "nenhum") : "escrever");
  const [texto, setTexto] = useState(passo?.texto ?? "");
  const [respostaId, setRespostaId] = useState(respostaExiste ? passo!.resposta_id! : (respostas[0]?.id ?? ""));
  const [midiaId, setMidiaId] = useState(midiaExiste ? passo!.midia_id! : "");
  const caixa = useRef<HTMLTextAreaElement>(null);
  const aqui = `${BASE}?editar=${sequencia.id}`;

  const bruto =
    fonte === "escrever" ? texto : fonte === "resposta" ? (textoDoPasso({ id: "", sequencia_id: "", ordem: 0, texto: null, resposta_id: respostaId, midia_id: null }, respostas) ?? "") : "";
  const previa = bruto ? preencherVariaveis(bruto, dados) : "";
  const semValor = bruto ? variaveisSemValor(bruto, dados).map((c) => VARIAVEIS.find((v) => v.chave === c)!.rotulo) : [];
  const midia = midias.find((m) => m.id === midiaId);

  function inserirVariavel(chave: string) {
    const el = caixa.current;
    const ini = el?.selectionStart ?? texto.length;
    const fim = el?.selectionEnd ?? texto.length;
    const marca = `${ini > 0 && !/\s/.test(texto[ini - 1]) ? " " : ""}{${chave}}`;
    const novo = (texto.slice(0, ini) + marca + texto.slice(fim)).slice(0, LIMITE_TEXTO_PASSO);
    setTexto(novo);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(ini + marca.length, ini + marca.length);
    });
  }

  function salvar(formData: FormData) {
    run(() => salvarPasso(formData), {
      onSuccess: () => {
        router.push(aqui);
        router.refresh();
      },
    });
  }

  const opcoesFonte: { valor: Fonte; label: string }[] = [
    { valor: "escrever", label: "Escrever" },
    { valor: "resposta", label: "Resposta" },
    { valor: "nenhum", label: "Sem texto" },
  ];

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={passo ? `Passo ${numero}` : "Novo passo"} back={{ href: aqui, label: sequencia.titulo }} />
      <form action={salvar} className="flex flex-col gap-7">
        {passo && <input type="hidden" name="id" value={passo.id} />}
        <input type="hidden" name="sequencia_id" value={sequencia.id} />

        <Grupo titulo="Texto" rodape={ficouVazio ? "A resposta pronta ou o arquivo deste passo foi apagado. Escolha outro texto ou arquivo." : undefined}>
          <Segmentado name="fonte" valor={fonte} opcoes={opcoesFonte} onMudar={setFonte} rotulo="Texto do passo" />
          {fonte === "escrever" && (
            <>
              <Field label="Texto" hint={`${texto.length} de ${LIMITE_TEXTO_PASSO}`}>
                <textarea
                  ref={caixa}
                  name="texto"
                  required
                  rows={5}
                  maxLength={LIMITE_TEXTO_PASSO}
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  placeholder="Oi! Aqui é da {negocio}. Vou te mandar o catálogo."
                  className={`${inputClass} min-h-32 resize-y leading-snug`}
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
            </>
          )}
          {fonte === "resposta" &&
            (respostas.length === 0 ? (
              <p className="text-[15px] text-ink-muted">
                Nenhuma resposta pronta.{" "}
                <Link href="/configuracoes/respostas?nova=1" className="text-brand-text hover:opacity-80">
                  Criar resposta
                </Link>
              </p>
            ) : (
              <Field label="Resposta pronta" hint="O passo usa o texto dela como estiver na hora.">
                <select name="resposta_id" value={respostaId} onChange={(e) => setRespostaId(e.target.value)} className={inputClass}>
                  {respostas.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.titulo}
                    </option>
                  ))}
                </select>
              </Field>
            ))}
        </Grupo>

        <Grupo
          titulo="Arquivo"
          rodape={
            midias.length === 0 ? (
              <>
                A biblioteca está vazia.{" "}
                <Link href="/configuracoes/midias" className="text-brand-text hover:opacity-80">
                  Adicionar arquivos
                </Link>
              </>
            ) : fonte !== "nenhum" && midia ? (
              "Na extensão, o texto entra primeiro. O clique seguinte abre a prévia do arquivo; o áudio vai como mensagem de voz, depois de confirmar a conversa."
            ) : undefined
          }
        >
          <Field label="Foto, PDF ou áudio">
            <select name="midia_id" value={midiaId} onChange={(e) => setMidiaId(e.target.value)} className={inputClass} disabled={midias.length === 0}>
              <option value="">Nenhum</option>
              {midias.map((m) => (
                <option key={m.id} value={m.id}>
                  {ROTULO_TIPO[m.tipo]}: {m.titulo}
                </option>
              ))}
            </select>
          </Field>
        </Grupo>

        <Grupo
          titulo="Prévia"
          rodape={
            semValor.length > 0 ? (
              <>
                A conta não tem {lista(semValor)}: {semValor.length === 1 ? "a linha com esse dado some" : "as linhas com esses dados somem"} do texto. Preencha em{" "}
                <Link href="/configuracoes" className="text-brand-text hover:opacity-80">
                  Configurações
                </Link>
                .
              </>
            ) : previa || midia ? (
              "Assim o passo entra na conversa."
            ) : (
              "Escolha um texto ou um arquivo para o passo."
            )
          }
        >
          {previa && <p className="whitespace-pre-wrap break-words text-[15px] leading-snug text-ink">{previa}</p>}
          {midia && <p className="text-[15px] text-ink">{`${ROTULO_TIPO[midia.tipo]}: ${midia.titulo}`}</p>}
          {!previa && !midia && <p className="text-[15px] text-ink-muted">Nada</p>}
        </Grupo>

        <div className="flex flex-col gap-2 sm:flex-row">
          <button type="submit" disabled={isPending} className={`${btnPrimary} w-full sm:w-auto`}>
            <RotuloAcao pendente={isPending} ocupado="Salvando...">
              Salvar
            </RotuloAcao>
          </button>
          <Link href={aqui} className={`${btnGhost} w-full sm:w-auto`}>
            Cancelar
          </Link>
        </div>
      </form>

      {passo && (
        <div className="mt-10 px-4">
          <ConfirmButton
            title={`Apagar o passo ${numero}?`}
            description="Sai só da sequência. A resposta pronta e o arquivo continuam."
            confirmLabel="Apagar"
            successMessage="Passo apagado."
            onConfirm={() => apagarPasso(passo.id)}
            onDone={() => {
              router.push(aqui);
              router.refresh();
            }}
            className="text-[15px] text-danger hover:opacity-80"
          >
            Apagar passo
          </ConfirmButton>
        </div>
      )}
    </div>
  );
}
