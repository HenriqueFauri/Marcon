"use client";

import { useRef, useState } from "react";
import { useAction } from "@/components/use-action";
import { Field, btnPrimary, btnSecondary, inputClass } from "@/components/ui";
import {
  EXEMPLO,
  MODELOS,
  MODELO_PERSONALIZADO,
  VARIAVEIS,
  renderizarModelo,
} from "@/lib/notificacao-modelos";
import { enviarNotificacaoTeste, salvarModeloNotificacao } from "./actions";

function Previa({ titulo, corpo }: { titulo: string; corpo: string }) {
  const { titulo: t, corpo: c } = renderizarModelo(titulo, corpo, EXEMPLO);
  return (
    <div className="flex gap-3 rounded-2xl bg-fill p-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icon.svg" alt="" width={36} height={36} className="h-9 w-9 shrink-0 rounded-lg" />
      <div className="min-w-0">
        <p className="truncate text-[13px] font-semibold text-ink">{t}</p>
        <p className="mt-0.5 whitespace-pre-line text-[13px] leading-snug text-ink-2">{c}</p>
      </div>
    </div>
  );
}

export function ModelosNotificacao({ atual }: { atual: { modelo: string; titulo: string; corpo: string } }) {
  const { isPending, run } = useAction();
  const [modelo, setModelo] = useState(atual.modelo);
  const [titulo, setTitulo] = useState(atual.modelo === MODELO_PERSONALIZADO ? atual.titulo : "");
  const [corpo, setCorpo] = useState(atual.modelo === MODELO_PERSONALIZADO ? atual.corpo : "");
  const corpoRef = useRef<HTMLTextAreaElement>(null);
  const personalizado = modelo === MODELO_PERSONALIZADO;
  const alterado = modelo !== atual.modelo || (personalizado && (titulo !== atual.titulo || corpo !== atual.corpo));

  function escolher(id: string) {
    setModelo(id);
    // começa o personalizado a partir do modelo que estava selecionado
    if (id === MODELO_PERSONALIZADO && !titulo && !corpo) {
      const base = MODELOS.find((m) => m.id === modelo) ?? MODELOS[0];
      setTitulo(base.titulo);
      setCorpo(base.corpo);
    }
  }

  function inserirVariavel(chave: string) {
    const el = corpoRef.current;
    const marca = `{${chave}}`;
    if (!el) return setCorpo((c) => c + marca);
    const ini = el.selectionStart ?? corpo.length;
    const fim = el.selectionEnd ?? corpo.length;
    setCorpo(corpo.slice(0, ini) + marca + corpo.slice(fim));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(ini + marca.length, ini + marca.length);
    });
  }

  return (
    <form action={(formData) => run(() => salvarModeloNotificacao(formData))} className="flex flex-col gap-4">
      <input type="hidden" name="modelo" value={modelo} />
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
            <Previa titulo={m.titulo} corpo={m.corpo} />
          </label>
        ))}

        <label
          className={`cursor-pointer rounded-2xl border p-3 transition ${personalizado ? "border-brand bg-brand/5" : "border-line hover:border-line-strong"}`}
        >
          <div className="flex items-start gap-2">
            <input type="radio" name="_modelo" checked={personalizado} onChange={() => escolher(MODELO_PERSONALIZADO)} className="mt-1" />
            <div>
              <span className="text-sm font-medium text-ink">Personalizado</span>
              <span className="block text-xs text-ink-muted">Escreva o seu texto com as variáveis da venda.</span>
            </div>
          </div>
        </label>
      </div>

      {personalizado && (
        <div className="flex flex-col gap-3 rounded-2xl border border-line p-3">
          <Field label={`Título (${titulo.length}/80)`}>
            <input name="titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={80} className={inputClass} />
          </Field>
          <Field label={`Texto (${corpo.length}/300)`}>
            <textarea
              ref={corpoRef}
              name="corpo"
              value={corpo}
              onChange={(e) => setCorpo(e.target.value)}
              maxLength={300}
              rows={4}
              className={inputClass}
            />
          </Field>
          <div>
            <p className="mb-1.5 text-xs text-ink-muted">Toque para inserir no texto. Linha com dado vazio (ex.: sem cliente) não aparece.</p>
            <div className="flex flex-wrap gap-1.5">
              {VARIAVEIS.map((v) => (
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
          <Previa titulo={titulo || "Título"} corpo={corpo} />
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={isPending || !alterado} className={btnPrimary}>
          {isPending ? "Salvando..." : "Salvar modelo"}
        </button>
        <button
          type="button"
          disabled={isPending || alterado}
          onClick={() => run(() => enviarNotificacaoTeste())}
          className={btnSecondary}
          title={alterado ? "Salve o modelo antes de testar" : undefined}
        >
          Enviar teste
        </button>
      </div>
    </form>
  );
}
