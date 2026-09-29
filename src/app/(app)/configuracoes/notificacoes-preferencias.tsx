"use client";

import { useState } from "react";
import { useAction } from "@/components/use-action";
import { btnPrimary, btnSecondary } from "@/components/ui";
import {
  CAMPOS_COBRANCA,
  CAMPOS_VENDA,
  GRUPOS,
  type CampoCobranca,
  type CampoVenda,
  type Grupo,
  type Preferencias,
} from "@/lib/notificacoes";
import { enviarNotificacaoTeste, salvarPreferenciasNotificacao } from "./actions";

// ordem fixa das chaves: a comparação com o que está salvo é por texto
function assinatura(desativados: Grupo[], venda: Record<CampoVenda, boolean>, cobranca: Record<CampoCobranca, boolean>) {
  return JSON.stringify([
    [...desativados].sort(),
    CAMPOS_VENDA.map((c) => venda[c.id]),
    CAMPOS_COBRANCA.map((c) => cobranca[c.id]),
  ]);
}

function Opcao({
  rotulo,
  descricao,
  marcado,
  onChange,
}: {
  rotulo: string;
  descricao?: string;
  marcado: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-line p-3">
      <input type="checkbox" checked={marcado} onChange={onChange} className="mt-1" />
      <span>
        <span className="text-sm font-medium text-ink">{rotulo}</span>
        {descricao && <span className="block text-xs text-ink-muted">{descricao}</span>}
      </span>
    </label>
  );
}

export function NotificacoesPreferencias({ atual }: { atual: Preferencias }) {
  const { isPending, run } = useAction();
  const [desativados, setDesativados] = useState<Grupo[]>(atual.desativados);
  const [venda, setVenda] = useState(atual.dados.venda);
  const [cobranca, setCobranca] = useState(atual.dados.cobranca);

  const alterado =
    assinatura(desativados, venda, cobranca) !== assinatura(atual.desativados, atual.dados.venda, atual.dados.cobranca);

  function alternarGrupo(grupo: Grupo) {
    setDesativados((d) => (d.includes(grupo) ? d.filter((g) => g !== grupo) : [...d, grupo]));
  }

  return (
    <form action={(formData) => run(() => salvarPreferenciasNotificacao(formData))} className="flex flex-col gap-5">
      <input type="hidden" name="desativados" value={JSON.stringify(desativados)} />
      <input type="hidden" name="dados" value={JSON.stringify({ venda, cobranca })} />

      <section>
        <h3 className="mb-2 text-sm font-semibold text-ink">O que receber</h3>
        <div className="flex flex-col gap-2">
          {GRUPOS.map((g) => (
            <Opcao
              key={g.id}
              rotulo={g.rotulo}
              descricao={g.descricao}
              marcado={!desativados.includes(g.id)}
              onChange={() => alternarGrupo(g.id)}
            />
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-1 text-sm font-semibold text-ink">Dados no aviso de venda</h3>
        <p className="mb-2 text-xs text-ink-muted">Quanto menos, mais limpo. O essencial é produto, valor e lucro.</p>
        <div className="flex flex-wrap gap-2">
          {CAMPOS_VENDA.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={venda[c.id]}
              onClick={() => setVenda((v) => ({ ...v, [c.id]: !v[c.id] }))}
              className={`rounded-full px-3 py-1.5 text-sm transition ${venda[c.id] ? "bg-brand-fill text-on-brand" : "bg-fill text-ink-2 hover:bg-fill-strong"}`}
            >
              {c.rotulo}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-ink">Dados no lembrete de cobrança</h3>
        <div className="flex flex-wrap gap-2">
          {CAMPOS_COBRANCA.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={cobranca[c.id]}
              onClick={() => setCobranca((v) => ({ ...v, [c.id]: !v[c.id] }))}
              className={`rounded-full px-3 py-1.5 text-sm transition ${cobranca[c.id] ? "bg-brand-fill text-on-brand" : "bg-fill text-ink-2 hover:bg-fill-strong"}`}
            >
              {c.rotulo}
            </button>
          ))}
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={isPending || !alterado} className={btnPrimary}>
          {isPending ? "Salvando..." : "Salvar"}
        </button>
        <button
          type="button"
          disabled={isPending || alterado}
          onClick={() => run(() => enviarNotificacaoTeste())}
          className={btnSecondary}
          title={alterado ? "Salve antes de testar" : "Manda um aviso de exemplo para este aparelho"}
        >
          Enviar um teste
        </button>
      </div>
    </form>
  );
}
