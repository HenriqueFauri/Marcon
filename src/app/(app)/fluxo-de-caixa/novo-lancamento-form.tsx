"use client";

import { RotuloAcao } from "@/components/rotulo-acao";
import { useState, type ReactNode } from "react";
import { Modal } from "@/components/modal";
import { useAction } from "@/components/use-action";
import { ConfirmButton } from "@/components/confirm-button";
import { Segmentado } from "@/components/ajustes";
import { Field, btnGhost, btnPrimary, inputClass } from "@/components/ui";
import { IconPlus } from "@/components/icons";
import { formatBRL } from "@/lib/format";
import { atualizarLancamento, criarLancamentoManual, excluirLancamento } from "./actions";

const CATEGORIAS_PADRAO = ["Aluguel", "Energia", "Internet", "Frete", "Embalagens", "Marketing", "Taxas", "Salários", "Retirada", "Aporte", "Outros"];

export interface LancamentoValores {
  id: string;
  tipo: "entrada" | "saida";
  descricao: string;
  valor: number;
  data: string;
  categoria: string;
}

// Lançamento manual: novo (botão do cabeçalho) ou edição (a linha do extrato abre esta janela).
// Excluir fica no fim da janela de editar, nunca na linha da lista.
export function LancamentoForm({
  hoje,
  categorias,
  lancamento,
  trigger,
  triggerClassName,
  triggerLabel,
}: {
  hoje: string;
  categorias: string[];
  lancamento?: LancamentoValores;
  trigger?: ReactNode;
  triggerClassName?: string;
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [tipo, setTipo] = useState<"entrada" | "saida">(lancamento?.tipo ?? "saida");
  const { isPending, run } = useAction();
  const sugestoes = Array.from(new Set([...categorias, ...CATEGORIAS_PADRAO])).filter(
    (c) => c !== "Venda" && c !== "Fornecimento" && c !== "Estorno",
  );
  const salvar = lancamento ? atualizarLancamento.bind(null, lancamento.id) : criarLancamentoManual;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setErro(null);
          setTipo(lancamento?.tipo ?? "saida");
          setOpen(true);
        }}
        className={triggerClassName ?? btnPrimary}
        aria-label={triggerLabel}
      >
        {trigger ?? (
          <>
            <IconPlus width={16} height={16} /> Novo lançamento
          </>
        )}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={lancamento ? "Editar lançamento" : "Novo lançamento"} size="sm" folha>
        <form
          action={(formData) => run(() => salvar(formData), { onSuccess: () => setOpen(false), onError: setErro })}
          className="flex flex-col gap-4"
        >
          <Segmentado
            name="tipo"
            rotulo="Tipo"
            valor={tipo}
            onMudar={setTipo}
            opcoes={[
              { valor: "saida", label: "Saída (gasto)" },
              { valor: "entrada", label: "Entrada" },
            ]}
          />

          <Field label="Descrição *">
            <input
              name="descricao"
              required
              autoFocus={!lancamento}
              defaultValue={lancamento?.descricao}
              className={inputClass}
              placeholder="Ex: Conta de luz de setembro"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Valor (R$) *">
              <input
                name="valor"
                inputMode="decimal"
                required
                defaultValue={lancamento ? lancamento.valor.toFixed(2).replace(".", ",") : undefined}
                className={inputClass}
                placeholder="0,00"
                pattern="[0-9]+([.,][0-9]{1,2})?"
              />
            </Field>
            <Field label="Data">
              <input name="data" type="date" defaultValue={lancamento?.data ?? hoje} className={inputClass} />
            </Field>
          </div>

          <Field label="Categoria">
            <input name="categoria" list="categorias-caixa" defaultValue={lancamento?.categoria ?? "Outros"} className={inputClass} />
            <datalist id="categorias-caixa">
              {sugestoes.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>

          {erro && (
            <p role="alert" className="text-sm text-danger">
              {erro}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => setOpen(false)} className={btnGhost}>
              Cancelar
            </button>
            <button type="submit" disabled={isPending} className={btnPrimary}>
              <RotuloAcao pendente={isPending} ocupado="Salvando...">{"Salvar"}</RotuloAcao>
            </button>
          </div>
        </form>

        {lancamento && (
          <div className="mt-5 border-t border-line pt-4 text-center">
            <ConfirmButton
              title="Excluir este lançamento?"
              description={`${lancamento.descricao}: ${formatBRL(lancamento.valor)}`}
              ariaLabel="Excluir lançamento"
              onConfirm={() => excluirLancamento(lancamento.id)}
              onDone={() => setOpen(false)}
              className="text-[15px] font-medium text-danger hover:opacity-80"
            >
              Excluir lançamento
            </ConfirmButton>
          </div>
        )}
      </Modal>
    </>
  );
}
