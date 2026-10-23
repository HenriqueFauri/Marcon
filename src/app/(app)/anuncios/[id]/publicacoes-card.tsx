"use client";

import { useState } from "react";
import type { AnuncioPublicacao } from "@/types/domain";
import { situacaoDaPublicacao, textoDaSituacao } from "@/lib/publicacao";
import { useAction } from "@/components/use-action";
import { ConfirmButton } from "@/components/confirm-button";
import { Grupo } from "@/components/ajustes";
import { btnPrimary, btnSecondary, inputClass } from "@/components/ui";
import { removerPublicacao, salvarPublicacao } from "../actions";

const PRAZOS = [7, 15, 30, 45, 60, 90];

export function PublicacoesCard({
  produtoId,
  publicacao,
  hoje,
}: {
  produtoId: string;
  publicacao: AnuncioPublicacao | undefined;
  hoje: string;
}) {
  const { isPending, run } = useAction();
  const [link, setLink] = useState(publicacao?.link ?? "");
  const [data, setData] = useState(publicacao?.publicado_em ?? hoje);
  const [dias, setDias] = useState(publicacao?.renovar_dias ?? 30);
  const alterado =
    !publicacao || link !== (publicacao.link ?? "") || data !== publicacao.publicado_em || dias !== publicacao.renovar_dias;
  const situacao = publicacao ? situacaoDaPublicacao(publicacao.publicado_em, publicacao.renovar_dias, hoje) : null;
  const prazos = PRAZOS.includes(dias) ? PRAZOS : [...PRAZOS, dias].sort((a, b) => a - b);

  function salvar(publicadoEm: string, sucesso?: string) {
    run(() => salvarPublicacao({ produtoId, link, publicadoEm, renovarDias: dias }), {
      success: sucesso,
      onSuccess: () => setData(publicadoEm),
    });
  }

  return (
    <Grupo
      titulo="Onde está publicado"
      rodape="Marketplace derruba anúncio velho. Anote a data e o prazo e a gente te avisa, por notificação, quando chegar a hora de renovar."
      semPadding
    >
    <div className="flex flex-col gap-3 px-4 py-4 sm:px-5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[17px] font-semibold text-ink">Link e prazo</p>
        <p
          className={`text-[13px] ${
            situacao?.tipo === "vencido" ? "font-semibold text-danger" : situacao?.tipo === "vence-logo" ? "font-semibold text-warning" : "text-ink-muted"
          }`}
        >
          {situacao ? textoDaSituacao(situacao) : "Não publicado"}
        </p>
      </div>

      <div>
        <label htmlFor={`link-publicacao`} className="mb-1 block text-[13px] font-medium text-ink-muted">
          Link do anúncio
        </label>
        <input
          id={`link-publicacao`}
          type="url"
          inputMode="url"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          maxLength={500}
          placeholder="https://..."
          className={inputClass}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="min-w-0">
          <label htmlFor={`data-publicacao`} className="mb-1 block text-[13px] font-medium text-ink-muted">
            Publicado em
          </label>
          <input id={`data-publicacao`} type="date" value={data} max={hoje} onChange={(e) => setData(e.target.value)} className={inputClass} />
        </div>
        <div className="min-w-0">
          <label htmlFor={`dias-publicacao`} className="mb-1 block text-[13px] font-medium text-ink-muted">
            Lembrar de renovar
          </label>
          <select id={`dias-publicacao`} value={dias} onChange={(e) => setDias(Number(e.target.value))} className={inputClass}>
            {prazos.map((p) => (
              <option key={p} value={p}>
                depois de {p} dias
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <button type="button" onClick={() => salvar(data)} disabled={isPending || !data || !alterado} className={`${btnPrimary} w-full sm:w-auto`}>
          {isPending ? "Salvando..." : publicacao ? "Salvar" : "Marcar como publicado"}
        </button>
        {publicacao && (
          <button
            type="button"
            onClick={() => salvar(hoje, "Renovado hoje.")}
            disabled={isPending || !hoje}
            className={`${btnSecondary} w-full sm:w-auto`}
          >
            Renovei hoje
          </button>
        )}
        {publicacao?.link && (
          <a href={publicacao.link} target="_blank" rel="noopener noreferrer" className="text-center text-[15px] font-medium text-brand-text hover:underline sm:ml-auto">
            Abrir anúncio
          </a>
        )}
        {publicacao && (
          <span className={publicacao.link ? "self-end" : "sm:ml-auto"}>
            <ConfirmButton
              title="Tirar da lista de publicados?"
              description="O link, a data e o prazo de renovar deste anúncio"
              ariaLabel="Remover publicação"
              onConfirm={() => removerPublicacao(produtoId)}
            />
          </span>
        )}
      </div>
    </div>
    </Grupo>
  );
}
