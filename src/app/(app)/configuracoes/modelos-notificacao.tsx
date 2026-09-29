"use client";

import { useRef, useState } from "react";
import { useAction } from "@/components/use-action";
import { Field, btnPrimary, btnSecondary, inputClass } from "@/components/ui";
import {
  EVENTOS,
  GRUPOS,
  MODELOS,
  MODELO_PADRAO,
  MODELO_PERSONALIZADO,
  infoDoEvento,
  normalizarTexto,
  renderizar,
  type Evento,
  type Grupo,
  type PreferenciaNotificacao,
  type Texto,
} from "@/lib/notificacao-modelos";
import { enviarNotificacaoTeste, salvarModeloNotificacao } from "./actions";

type Personalizados = Record<Evento, Texto>;

function textosDoModelo(id: string): Personalizados {
  const base = MODELOS.find((m) => m.id === id) ?? MODELOS.find((m) => m.id === MODELO_PADRAO)!;
  return structuredClone(base.textos);
}

// Completa com o modelo de base o que o usuário ainda não personalizou
function preencher(parcial: PreferenciaNotificacao["personalizados"], baseId: string): Personalizados {
  const base = textosDoModelo(baseId);
  for (const e of EVENTOS) if (parcial[e.id]) base[e.id] = { ...parcial[e.id]! };
  return base;
}

// Forma comparável do que seria salvo: ignora \r\n e espaços nas pontas, que o
// servidor também normaliza — sem isso o formulário parece nunca estar salvo.
function assinatura(modelo: string, personalizados: Personalizados, desativados: Grupo[]) {
  return JSON.stringify({
    modelo,
    personalizados:
      modelo === MODELO_PERSONALIZADO
        ? EVENTOS.map((e) => [normalizarTexto(personalizados[e.id].titulo), normalizarTexto(personalizados[e.id].corpo)])
        : null,
    desativados: [...desativados].sort(),
  });
}

function Previa({ titulo, corpo, evento }: { titulo: string; corpo: string; evento: Evento }) {
  const r = renderizar(titulo, corpo, infoDoEvento(evento).exemplo);
  return (
    <div className="flex gap-3 rounded-2xl bg-fill p-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icon.svg" alt="" width={36} height={36} className="h-9 w-9 shrink-0 rounded-lg" />
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-ink">{r.titulo}</p>
        <p className="mt-0.5 whitespace-pre-line text-[13px] leading-snug text-ink-2">{r.corpo}</p>
      </div>
    </div>
  );
}

export function ModelosNotificacao({ atual }: { atual: PreferenciaNotificacao }) {
  const { isPending, run } = useAction();
  const [modelo, setModelo] = useState(atual.modelo);
  const [personalizados, setPersonalizados] = useState<Personalizados>(() => preencher(atual.personalizados, MODELO_PADRAO));
  const [desativados, setDesativados] = useState<Grupo[]>(atual.desativados);
  const [evento, setEvento] = useState<Evento>("venda");
  const [editou, setEditou] = useState(false);
  const corpoRef = useRef<HTMLTextAreaElement>(null);

  const personalizado = modelo === MODELO_PERSONALIZADO;
  const info = infoDoEvento(evento);
  const alterado =
    assinatura(modelo, personalizados, desativados) !==
    assinatura(atual.modelo, preencher(atual.personalizados, MODELO_PADRAO), atual.desativados);

  function escolher(id: string) {
    // o personalizado começa a partir do modelo que estava escolhido
    if (id === MODELO_PERSONALIZADO && modelo !== MODELO_PERSONALIZADO && !editou) {
      setPersonalizados(preencher(atual.modelo === MODELO_PERSONALIZADO ? atual.personalizados : {}, modelo));
    }
    setModelo(id);
  }

  function editar(campo: keyof Texto, valor: string) {
    setEditou(true);
    setPersonalizados((p) => ({ ...p, [evento]: { ...p[evento], [campo]: valor } }));
  }

  function inserirVariavel(chave: string) {
    const el = corpoRef.current;
    const marca = `{${chave}}`;
    const corpo = personalizados[evento].corpo;
    if (!el) return editar("corpo", corpo + marca);
    const ini = el.selectionStart ?? corpo.length;
    const fim = el.selectionEnd ?? corpo.length;
    editar("corpo", corpo.slice(0, ini) + marca + corpo.slice(fim));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(ini + marca.length, ini + marca.length);
    });
  }

  function alternarGrupo(grupo: Grupo) {
    setDesativados((d) => (d.includes(grupo) ? d.filter((g) => g !== grupo) : [...d, grupo]));
  }

  const textoAtual = personalizados[evento];

  return (
    <form action={(formData) => run(() => salvarModeloNotificacao(formData))} className="flex flex-col gap-5">
      <input type="hidden" name="modelo" value={modelo} />
      <input type="hidden" name="personalizados" value={JSON.stringify(personalizados)} />
      <input type="hidden" name="desativados" value={JSON.stringify(desativados)} />

      <section>
        <h3 className="mb-2 text-sm font-semibold text-ink">O que receber</h3>
        <div className="flex flex-col gap-2">
          {GRUPOS.map((g) => (
            <label key={g.id} className="flex cursor-pointer items-start gap-3 rounded-2xl border border-line p-3">
              <input
                type="checkbox"
                checked={!desativados.includes(g.id)}
                onChange={() => alternarGrupo(g.id)}
                className="mt-1"
              />
              <span>
                <span className="text-sm font-medium text-ink">{g.rotulo}</span>
                <span className="block text-xs text-ink-muted">{g.descricao}</span>
              </span>
            </label>
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-1 text-sm font-semibold text-ink">Estilo</h3>
        <p className="mb-2 text-xs text-ink-muted">Cada estilo tem um texto para cada tipo de aviso. Escolha o tipo para ver como fica:</p>
        <div className="mb-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Tipo de notificação">
          {EVENTOS.map((e) => (
            <button
              key={e.id}
              type="button"
              role="tab"
              aria-selected={evento === e.id}
              onClick={() => setEvento(e.id)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${evento === e.id ? "bg-brand-fill text-on-brand" : "bg-fill text-ink-2 hover:bg-fill-strong"}`}
            >
              {e.rotulo}
            </button>
          ))}
        </div>
        <p className="mb-3 text-xs text-ink-muted">{info.descricao}</p>

        <div className="flex flex-col gap-3">
          {MODELOS.map((m) => (
            <label
              key={m.id}
              className={`cursor-pointer rounded-2xl border p-3 transition ${modelo === m.id ? "border-brand bg-brand/5" : "border-line hover:border-line-strong"}`}
            >
              <div className="mb-2 flex items-start gap-2">
                <input type="radio" name="_modelo" checked={modelo === m.id} onChange={() => escolher(m.id)} className="mt-1" />
                <div>
                  <span className="text-sm font-medium text-ink">{m.nome}</span>
                  <span className="block text-xs text-ink-muted">{m.descricao}</span>
                </div>
              </div>
              <Previa titulo={m.textos[evento].titulo} corpo={m.textos[evento].corpo} evento={evento} />
            </label>
          ))}

          <label
            className={`cursor-pointer rounded-2xl border p-3 transition ${personalizado ? "border-brand bg-brand/5" : "border-line hover:border-line-strong"}`}
          >
            <div className="flex items-start gap-2">
              <input type="radio" name="_modelo" checked={personalizado} onChange={() => escolher(MODELO_PERSONALIZADO)} className="mt-1" />
              <div>
                <span className="text-sm font-medium text-ink">Personalizado</span>
                <span className="block text-xs text-ink-muted">Escreva o seu texto para cada tipo de aviso.</span>
              </div>
            </div>
          </label>
        </div>
      </section>

      {personalizado && (
        <section className="flex flex-col gap-3 rounded-2xl border border-line p-3">
          <p className="text-sm font-medium text-ink">Editando: {info.rotulo}</p>
          <Field label={`Título (${textoAtual.titulo.length}/80)`}>
            <input value={textoAtual.titulo} onChange={(e) => editar("titulo", e.target.value)} maxLength={80} className={inputClass} />
          </Field>
          <Field label={`Texto (${textoAtual.corpo.length}/300)`}>
            <textarea
              ref={corpoRef}
              value={textoAtual.corpo}
              onChange={(e) => editar("corpo", e.target.value)}
              maxLength={300}
              rows={4}
              className={inputClass}
            />
          </Field>
          <div>
            <p className="mb-1.5 text-xs text-ink-muted">Toque para inserir no texto. Linha com dado vazio (ex.: venda sem cliente) não aparece.</p>
            <div className="flex flex-wrap gap-1.5">
              {info.variaveis.map((v) => (
                <button
                  key={v.chave}
                  type="button"
                  title={v.descricao}
                  onClick={() => inserirVariavel(v.chave)}
                  className="rounded-full bg-fill px-2.5 py-1 text-xs text-ink-2 hover:bg-fill-strong"
                >
                  {`{${v.chave}}`}
                </button>
              ))}
            </div>
          </div>
          <Previa titulo={textoAtual.titulo || "Título"} corpo={textoAtual.corpo} evento={evento} />
        </section>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={isPending || !alterado} className={btnPrimary}>
          {isPending ? "Salvando..." : "Salvar"}
        </button>
        <button
          type="button"
          disabled={isPending || alterado}
          onClick={() => run(() => enviarNotificacaoTeste(evento))}
          className={btnSecondary}
          title={alterado ? "Salve antes de testar" : undefined}
        >
          Enviar teste: {info.rotulo}
        </button>
      </div>
    </form>
  );
}
