"use client";

import { useRef, useState } from "react";
import { useAction } from "@/components/use-action";
import { ConfirmButton } from "@/components/confirm-button";
import { formatBRL, formatData } from "@/lib/format";
import { rotuloDoCupom } from "@/lib/vitrine";
import { Badge, Field, btnPrimary, btnSecondary, inputClass } from "@/components/ui";
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
    <div className="flex flex-col gap-4">
      {cupons.length > 0 && (
        <ul className="divide-y divide-line">
          {cupons.map((c) => {
            const venceu = vencido(c, hoje);
            return (
              <li key={c.id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-[14px] font-semibold text-ink">{c.codigo}</span>
                    {venceu ? <Badge tone="warning">Vencido</Badge> : !c.ativo && <Badge>Desligado</Badge>}
                  </div>
                  <p className="text-xs text-ink-muted">
                    {rotuloDoCupom(c)}
                    {c.minimo ? ` em pedidos a partir de ${formatBRL(c.minimo)}` : ""}
                    {c.validade ? `. Vale até ${formatData(c.validade)}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => run(() => alternarCupom(c.id, !c.ativo))}
                  className="shrink-0 rounded-full px-3 py-1.5 text-[13px] font-medium text-ink-2 transition hover:bg-fill"
                >
                  {c.ativo ? "Desligar" : "Ligar"}
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
      )}

      {criando ? (
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
          className="flex flex-col gap-3 rounded-2xl bg-fill/60 p-4"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Código" hint="O cliente digita no pedido. Ex: BEMVINDO10">
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
            <Field label="Desconto">
              <div className="flex gap-2">
                <select
                  name="tipo"
                  value={tipo}
                  onChange={(e) => setTipo(e.target.value as "percentual" | "valor")}
                  className={`${inputClass} w-24 shrink-0`}
                  aria-label="Tipo de desconto"
                >
                  <option value="percentual">%</option>
                  <option value="valor">R$</option>
                </select>
                <input
                  name="valor"
                  required
                  inputMode="decimal"
                  placeholder={tipo === "percentual" ? "10" : "15,00"}
                  className={inputClass}
                  aria-label="Valor do desconto"
                />
              </div>
            </Field>
            <Field label="Pedido mínimo (opcional)">
              <input name="minimo" inputMode="decimal" placeholder="Ex: 100,00" className={inputClass} />
            </Field>
            <Field label="Vale até (opcional)">
              <input name="validade" type="date" min={hoje} className={inputClass} />
            </Field>
          </div>
          <p className="text-xs text-ink-muted">O desconto vale sobre os produtos, não sobre o frete.</p>
          <div className="flex gap-2">
            <button type="submit" disabled={isPending} className={btnPrimary}>
              {isPending ? "Criando..." : "Criar cupom"}
            </button>
            {cupons.length > 0 && (
              <button type="button" onClick={() => setCriando(false)} className={btnSecondary}>
                Cancelar
              </button>
            )}
          </div>
        </form>
      ) : (
        <button type="button" onClick={() => setCriando(true)} className={`${btnSecondary} w-fit`}>
          Novo cupom
        </button>
      )}
    </div>
  );
}
