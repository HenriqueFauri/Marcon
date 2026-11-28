import Link from "next/link";
import { Grupo } from "@/components/ajustes";
import { SetaLink, linkPendente } from "@/components/seta-link";
import { ErrorMessage } from "@/components/ui";
import { rotuloDoCancelamento } from "@/lib/cancelamento";
import { dataISONoFuso, formatData } from "@/lib/format";

export interface RespostaDeCancelamento {
  id: string;
  owner_id: string;
  conta: string;
  motivo: string;
  comentario: string | null;
  ciclo: string | null;
  criado_em: string;
}

// as respostas mais recentes da pergunta feita a quem cancela (migration 0071)
export function MotivosDeCancelamento({ respostas, falhou }: { respostas: RespostaDeCancelamento[]; falhou: boolean }) {
  if (falhou) {
    return (
      <div className="mt-7">
        <ErrorMessage>Não consegui ler os motivos de cancelamento. Rode a migration 0071_motivos_cancelamento.sql.</ErrorMessage>
      </div>
    );
  }
  if (respostas.length === 0) return null;

  return (
    <Grupo titulo="Motivos de cancelamento" rodape="Até as 20 respostas mais recentes." semPadding className="mt-7">
      <ul className="divide-y divide-line">
        {respostas.map((r) => (
          <li key={r.id}>
            <Link
              href={`/admin/contas/${r.owner_id}`}
              className={`flex items-center gap-3 px-4 py-3 transition hover:bg-fill/60 active:bg-fill ${linkPendente}`}
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[17px] text-ink">{rotuloDoCancelamento(r.motivo)}</span>
                <span className="block truncate text-[13px] text-ink-muted">
                  {[r.conta, r.ciclo, formatData(dataISONoFuso(new Date(r.criado_em)))].filter(Boolean).join(" · ")}
                </span>
                {r.comentario && <span className="mt-1 block whitespace-pre-line break-words text-[15px] text-ink-2">{r.comentario}</span>}
              </span>
              <SetaLink />
            </Link>
          </li>
        ))}
      </ul>
    </Grupo>
  );
}
