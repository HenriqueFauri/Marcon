"use client";

import { useRef, useState } from "react";
import { useAction } from "@/components/use-action";
import { ConfirmButton } from "@/components/confirm-button";
import { formatBRL, formatData } from "@/lib/format";
import { rotuloDoCupom } from "@/lib/vitrine";
import { Badge, Field, btnPrimary, btnSecondary, inputClass } from "@/components/ui";
import { IconPlus } from "@/components/icons";
import { Grupo } from "./campos";
import { alternarCupom, criarCupom, excluirCupom } from "./actions";

export interface CupomDaLista {
  id: string;
  codigo: string;
  tipo: "percentual" | "valor";
  valor: number;
  minimo: number | null;
  validade: string | null;
  ativo: boolean;
}

// o mesmo critério da função validar_cupom_vitrine: vale até o fim do dia da validade
function vencido(c: CupomDaLista, hoje: string) {
  return !!c.validade && c.validade < hoje;
}

export function Cupons({ cupons, hoje }: { cupons: CupomDaLista[]; hoje: string }) {
  const { isPending, run } = useAction();
  const [criando, setCriando] = useState(cupons.length === 0);
  const [tipo, setTipo] = useState<"percentual" | "valor">("percentual");
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div className="flex flex-col gap-7">
      {cupons.length > 0 && (
        <Grupo titulo="Seus cupons" semPadding>
          <ul className="divide-y divide-line">
            {cupons.map((c) => {
              const venceu = vencido(c, hoje);
              return (
                <li key={c.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-[15px] font-semibold tracking-wide text-ink">{c.codigo}</span>
                      {venceu ? <Badge tone="warning">Vencido</Badge> : !c.ativo && <Badge>Desligado</Badge>}
                    </div>
                    <p className="mt-0.5 text-[13px] leading-snug text-ink-muted">
                      {rotuloDoCupom(c)}
                      {c.minimo ? ` em pedidos a partir de ${formatBRL(c.minimo)}` : ""}
                      {c.validade ? `. Vale até ${formatData(c.validade)}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={c.ativo}
                    aria-label={c.ativo ? `Desligar o cupom ${c.codigo}` : `Ligar o cupom ${c.codigo}`}
                    disabled={isPending}
                    onClick={() => run(() => alternarCupom(c.id, !c.ativo))}
                    className={`relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors disabled:opacity-60 ${c.ativo ? "bg-positive" : "bg-fill-strong"}`}
                  >
                    <span
                      className={`absolute left-[2px] top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,0.2)] transition-transform ${c.ativo ? "translate-x-5" : ""}`}
                    />
                  </button>
                  <ConfirmButton
                    title={`Excluir o cupom ${c.codigo}?`}
                    description="Quem já tem o código não consegue mais usar."
                    onConfirm={() => excluirCupom(c.id)}
                    ariaLabel={`Excluir o cupom ${c.codigo}`}
                  />
                </li>
              );
            })}
          </ul>
          {!criando && (
            <button
              type="button"
              onClick={() => setCriando(true)}
              className="flex w-full items-center gap-3 border-t border-line px-4 py-3 text-left text-[17px] text-brand-text transition hover:bg-fill/60 active:bg-fill"
            >
              <IconPlus width={18} height={18} />
              Novo cupom
            </button>
          )}
        </Grupo>
      )}

      {criando && (
        <Grupo titulo="Novo cupom" rodape="O desconto vale sobre os produtos, não sobre o frete.">
          <form
            ref={formRef}
            action={(formData) =>
              run(() => criarCupom(formData), {
                onSuccess: () => {
                  formRef.current?.reset();
                  setTipo("percentual");
                  setCriando(false);
                },
              })
            }
            className="flex flex-col gap-4"
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Código">
                <input
                  name="codigo"
                  required
                  maxLength={20}
                  placeholder="BEMVINDO10"
                  onChange={(e) => (e.currentTarget.value = e.currentTarget.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                  className={`${inputClass} font-mono uppercase`}
                  autoCapitalize="characters"
                  autoCorrect="off"
                />
              </Field>
              {/* div e não <label>: um rótulo com dois botões dentro clicaria o primeiro ao tocar no campo */}
              <div className="min-w-0">
                <span className="mb-1.5 block text-[13px] font-medium text-ink-muted">Desconto</span>
                <div className="flex gap-2">
                  <input type="hidden" name="tipo" value={tipo} />
                  <div className="flex shrink-0 rounded-xl bg-fill p-[3px]" role="radiogroup" aria-label="Tipo de desconto">
                    {(["percentual", "valor"] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        role="radio"
                        aria-checked={tipo === t}
                        onClick={() => setTipo(t)}
                        className={`w-11 rounded-[9px] text-[15px] transition ${
                          tipo === t ? "bg-surface font-semibold text-ink shadow-sm" : "font-medium text-ink-muted"
                        }`}
                      >
                        {t === "percentual" ? "%" : "R$"}
                      </button>
                    ))}
                  </div>
                  <input
                    name="valor"
                    required
                    inputMode="decimal"
                    placeholder={tipo === "percentual" ? "10" : "15,00"}
                    className={`${inputClass} min-w-0 flex-1`}
                    aria-label="Valor do desconto"
                  />
                </div>
              </div>
              <Field label="Pedido mínimo (opcional)">
                <input name="minimo" inputMode="decimal" placeholder="Ex: 100,00" className={inputClass} />
              </Field>
              <Field label="Vale até (opcional)">
                <input name="validade" type="date" min={hoje} className={inputClass} />
              </Field>
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={isPending} className={`${btnPrimary} flex-1 sm:flex-none`}>
                {isPending ? "Criando..." : "Criar cupom"}
              </button>
              {cupons.length > 0 && (
                <button type="button" onClick={() => setCriando(false)} className={btnSecondary}>
                  Cancelar
                </button>
              )}
            </div>
          </form>
        </Grupo>
      )}
    </div>
  );
}
