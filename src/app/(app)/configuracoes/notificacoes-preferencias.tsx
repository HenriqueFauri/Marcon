"use client";

import { RotuloAcao } from "@/components/rotulo-acao";
import { useState } from "react";
import { useAction } from "@/components/use-action";
import { Grupo, Interruptor } from "@/components/ajustes";
import { btnPrimary, btnSecondary } from "@/components/ui";
import {
  CAMPOS_COBRANCA,
  CAMPOS_VENDA,
  GRUPOS,
  type CampoCobranca,
  type CampoVenda,
  type Grupo as GrupoAviso,
  type Preferencias,
} from "@/lib/notificacoes";
import { enviarNotificacaoTeste, salvarPreferenciasNotificacao } from "./actions";

// ordem fixa das chaves: a comparação com o que está salvo é por texto
function assinatura(desativados: GrupoAviso[], venda: Record<CampoVenda, boolean>, cobranca: Record<CampoCobranca, boolean>) {
  return JSON.stringify([
    [...desativados].sort(),
    CAMPOS_VENDA.map((c) => venda[c.id]),
    CAMPOS_COBRANCA.map((c) => cobranca[c.id]),
  ]);
}

// uma linha de interruptor dentro de um Grupo sem padding
function Linha({ id, titulo, ajuda, ligado, onMudar }: { id: string; titulo: string; ajuda?: string; ligado: boolean; onMudar: () => void }) {
  return (
    <div className="border-t border-line px-4 py-3 first:border-t-0">
      <Interruptor name={id} padrao={ligado} titulo={titulo} ajuda={ajuda} onMudar={onMudar} />
    </div>
  );
}

export function NotificacoesPreferencias({ atual }: { atual: Preferencias }) {
  const { isPending, run } = useAction();
  const [desativados, setDesativados] = useState<GrupoAviso[]>(atual.desativados);
  const [venda, setVenda] = useState(atual.dados.venda);
  const [cobranca, setCobranca] = useState(atual.dados.cobranca);

  const alterado =
    assinatura(desativados, venda, cobranca) !== assinatura(atual.desativados, atual.dados.venda, atual.dados.cobranca);

  function alternarGrupo(grupo: GrupoAviso) {
    setDesativados((d) => (d.includes(grupo) ? d.filter((g) => g !== grupo) : [...d, grupo]));
  }

  return (
    <form action={(formData) => run(() => salvarPreferenciasNotificacao(formData))} className="flex flex-col gap-7">
      <input type="hidden" name="desativados" value={JSON.stringify(desativados)} />
      <input type="hidden" name="dados" value={JSON.stringify({ venda, cobranca })} />

      <Grupo titulo="O que receber" semPadding rodape="Os avisos mudam de frase a cada vez, é surpresa.">
        {GRUPOS.map((g) => (
          <Linha
            key={g.id}
            id={`receber_${g.id}`}
            titulo={g.rotulo}
            ajuda={g.descricao}
            ligado={!desativados.includes(g.id)}
            onMudar={() => alternarGrupo(g.id)}
          />
        ))}
      </Grupo>

      <Grupo titulo="Dados no aviso de venda" semPadding rodape="Quanto menos, mais limpo. O essencial é produto, valor e lucro.">
        {CAMPOS_VENDA.map((c) => (
          <Linha
            key={c.id}
            id={`venda_${c.id}`}
            titulo={c.rotulo}
            ligado={venda[c.id]}
            onMudar={() => setVenda((v) => ({ ...v, [c.id]: !v[c.id] }))}
          />
        ))}
      </Grupo>

      <Grupo titulo="Dados no lembrete de cobrança" semPadding>
        {CAMPOS_COBRANCA.map((c) => (
          <Linha
            key={c.id}
            id={`cobranca_${c.id}`}
            titulo={c.rotulo}
            ligado={cobranca[c.id]}
            onMudar={() => setCobranca((v) => ({ ...v, [c.id]: !v[c.id] }))}
          />
        ))}
      </Grupo>

      <div className="-mt-3 flex flex-col gap-2 sm:flex-row">
        {/* o destaque só aparece quando há o que salvar; senão o teste é a ação da vez */}
        <button type="submit" disabled={isPending || !alterado} className={`${alterado ? btnPrimary : btnSecondary} w-full sm:w-auto`}>
          <RotuloAcao pendente={isPending} ocupado="Salvando...">{"Salvar"}</RotuloAcao>
        </button>
        <button
          type="button"
          disabled={isPending || alterado}
          onClick={() => run(() => enviarNotificacaoTeste())}
          className={`${btnSecondary} w-full sm:w-auto`}
          title={alterado ? "Salve antes de testar" : "Manda um aviso de exemplo para este aparelho"}
        >
          Enviar um teste
        </button>
      </div>
    </form>
  );
}
