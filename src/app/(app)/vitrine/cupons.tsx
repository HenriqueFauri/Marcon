"use client";

import { useRef, useState } from "react";
import { useAction } from "@/components/use-action";
import { ConfirmButton } from "@/components/confirm-button";
import { formatBRL, formatData } from "@/lib/format";
import { rotuloDoCupom } from "@/lib/vitrine";
import { Badge, Field, btnPrimary, btnSecondary, inputClass } from "@/components/ui";
import { IconPlus } from "@/components/icons";
import { Modal } from "@/components/modal";
import { Grupo, Segmentado, SoInterruptor } from "./campos";
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
  // cupom aberto na folha (detalhes e Excluir, no fim, longe do switch da linha)
  const [abertoId, setAbertoId] = useState<string | null>(null);
  const aberto = cupons.find((c) => c.id === abertoId) ?? null;

  function detalheDoCupom(c: CupomDaLista) {
    return `${rotuloDoCupom(c)}${c.minimo ? ` em pedidos a partir de ${formatBRL(c.minimo)}` : ""}${
      c.validade ? `. Vale até ${formatData(c.validade)}` : ""
    }`;
  }

  return (
    <div className="flex flex-col gap-7">
      {cupons.length > 0 && (
        <Grupo titulo="Seus cupons" semPadding rodape="Toque num cupom para ver os detalhes ou excluir.">
          <ul className="divide-y divide-line">
            {cupons.map((c) => {
              const venceu = vencido(c, hoje);
              return (
                <li key={c.id} className="flex items-center gap-3 px-4 py-3">
                  <button type="button" onClick={() => setAbertoId(c.id)} className="min-w-0 flex-1 text-left">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-[17px] font-semibold tracking-wide text-ink">{c.codigo}</span>
                      {venceu ? <Badge tone="warning">Vencido</Badge> : !c.ativo && <Badge>Desligado</Badge>}
                    </span>
                    <span className="mt-0.5 block text-[13px] leading-snug text-ink-muted">{detalheDoCupom(c)}</span>
                  </button>
                  {/* a key muda com o valor: o switch acompanha a lista quando ela volta do servidor */}
                  <SoInterruptor
                    key={`${c.id}-${c.ativo}`}
                    name={`cupom_${c.id}`}
                    ligado={c.ativo}
                    rotulo={`Cupom ${c.codigo} ligado`}
                    desabilitado={isPending}
                    onMudar={(ligado) => run(() => alternarCupom(c.id, ligado))}
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
                  <div className="w-28 shrink-0 self-center">
                    <Segmentado
                      name="tipo"
                      rotulo="Tipo de desconto"
                      valor={tipo}
                      onMudar={setTipo}
                      opcoes={[
                        { valor: "percentual", label: "%" },
                        { valor: "valor", label: "R$" },
                      ]}
                    />
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

      <Modal open={!!aberto} onClose={() => setAbertoId(null)} title={aberto ? `Cupom ${aberto.codigo}` : "Cupom"} size="sm" folha>
        {aberto && (
          <div className="flex flex-col gap-5">
            <p className="text-[15px] text-ink-2">
              {detalheDoCupom(aberto)}.{" "}
              {vencido(aberto, hoje) ? "Já venceu." : aberto.ativo ? "Está ligado." : "Está desligado."}
            </p>
            {/* ação destrutiva no fim, como texto vermelho discreto */}
            <div className="flex justify-center border-t border-line pt-4">
              <ConfirmButton
                title={`Excluir o cupom ${aberto.codigo}?`}
                description="Quem já tem o código não consegue mais usar."
                onConfirm={() => excluirCupom(aberto.id)}
                onDone={() => setAbertoId(null)}
                ariaLabel={`Excluir o cupom ${aberto.codigo}`}
                className="inline-flex items-center rounded-full px-4 py-2 text-[15px] font-medium text-danger transition hover:bg-danger-tint"
              >
                Excluir cupom
              </ConfirmButton>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
