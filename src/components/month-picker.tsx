import Link from "next/link";
import { deslocarMes, mesAtual, nomeDoMes } from "@/lib/format";
import { IconChevronLeft, IconChevronRight } from "./icons";

// Navegação de mês por link (?mes=AAAA-MM): funciona sem JS e mantém a URL compartilhável.
export function MonthPicker({
  mes,
  basePath,
  params = {},
}: {
  mes: string;
  basePath: string;
  params?: Record<string, string | undefined>;
}) {
  const href = (m: string) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
    if (m !== mesAtual()) qs.set("mes", m);
    const s = qs.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  const noFuturo = mes >= mesAtual();

  return (
    <div className="flex w-full items-center justify-between rounded-full bg-surface sm:w-auto sm:self-start">
      <Link href={href(deslocarMes(mes, -1))} aria-label="Mês anterior" className="p-3 text-ink-muted hover:text-ink">
        <IconChevronLeft width={16} height={16} />
      </Link>
      <span className="min-w-36 flex-1 px-1 text-center text-[15px] font-semibold text-ink">{nomeDoMes(mes)}</span>
      {noFuturo ? (
        <span className="p-3 text-ink-faint" aria-hidden="true">
          <IconChevronRight width={16} height={16} />
        </span>
      ) : (
        <Link href={href(deslocarMes(mes, 1))} aria-label="Próximo mês" className="p-3 text-ink-muted hover:text-ink">
          <IconChevronRight width={16} height={16} />
        </Link>
      )}
    </div>
  );
}
