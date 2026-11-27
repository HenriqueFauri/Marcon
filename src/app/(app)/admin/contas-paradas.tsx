import Link from "next/link";
import { Grupo } from "@/components/ajustes";
import { SetaLink, linkPendente } from "@/components/seta-link";
import { dataISONoFuso, formatDataCurta, hojeISO } from "@/lib/format";

export const DIAS_PARADA = 7;

export interface ContaParada {
  id: string;
  titulo: string;
  situacao: string;
  ultimoAcesso: string | null; // AAAA-MM-DD no fuso do negócio
  ultimaVenda: string | null; // AAAA-MM-DD
  dias: number; // desde a última atividade
}

const DIA_MS = 24 * 60 * 60 * 1000;
const diasEntre = (de: string, ate: string) => Math.round((new Date(`${ate}T12:00:00`).getTime() - new Date(`${de}T12:00:00`).getTime()) / DIA_MS);

// atividade = o último acesso (login) ou a última venda, o que for mais recente.
// last_sign_in_at só muda num login novo, por isso a venda entra junto: quem vende com a sessão aberta não conta como parada.
export function contaParada(o: {
  id: string;
  titulo: string;
  situacao: string;
  criadaEm: string;
  ultimoLogin: string | null | undefined;
  ultimaVenda: string | null | undefined;
}): ContaParada | null {
  const hoje = hojeISO();
  const criada = dataISONoFuso(new Date(o.criadaEm));
  // conta com menos de 7 dias ainda não teve tempo de parar
  if (diasEntre(criada, hoje) < DIAS_PARADA) return null;
  const ultimoAcesso = o.ultimoLogin ? dataISONoFuso(new Date(o.ultimoLogin)) : null;
  const ultimaVenda = o.ultimaVenda ?? null;
  const ultima = [ultimoAcesso, ultimaVenda, criada].filter((d): d is string => !!d).sort().at(-1)!;
  const dias = diasEntre(ultima, hoje);
  if (dias < DIAS_PARADA) return null;
  return { id: o.id, titulo: o.titulo, situacao: o.situacao, ultimoAcesso, ultimaVenda, dias };
}

// contas sem acesso nem venda há 7 dias ou mais, para chamar de volta (plano de marketing, H3)
export function ContasParadas({ contas }: { contas: ContaParada[] }) {
  if (contas.length === 0) return null;
  // quem parou há menos tempo primeiro: é quem tem mais chance de voltar
  const ordenadas = [...contas].sort((a, b) => a.dias - b.dias);

  return (
    <Grupo
      titulo={`Paradas há ${DIAS_PARADA} dias ou mais · ${contas.length}`}
      rodape="Sem acesso e sem venda no período. A conta admin e as bloqueadas ficam de fora."
      semPadding
      className="mb-7"
    >
      <ul className="divide-y divide-line">
        {ordenadas.map((c) => (
          <li key={c.id}>
            <Link
              href={`/admin/contas/${c.id}`}
              className={`flex items-center gap-3 px-4 py-3 transition hover:bg-fill/60 active:bg-fill ${linkPendente}`}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[17px] text-ink">{c.titulo}</span>
                <span className="block truncate text-[13px] text-ink-muted">
                  {[
                    c.situacao,
                    c.ultimoAcesso ? `acesso ${formatDataCurta(c.ultimoAcesso)}` : "nunca acessou",
                    c.ultimaVenda ? `venda ${formatDataCurta(c.ultimaVenda)}` : "sem venda",
                  ].join(" · ")}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-[17px] tabular-nums text-ink">{c.dias}</span>
                <span className="block text-[13px] text-ink-muted">{c.dias === 1 ? "dia" : "dias"}</span>
              </span>
              <SetaLink />
            </Link>
          </li>
        ))}
      </ul>
    </Grupo>
  );
}
