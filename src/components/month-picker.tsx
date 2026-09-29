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
    <div className="inline-flex items-center rounded-lg border border-neutral-800 bg-neutral-900">
      <Link href={href(deslocarMes(mes, -1))} aria-label="Mês anterior" className="p-2 text-neutral-400 hover:text-white">
        <IconChevronLeft width={16} height={16} />
      </Link>
      <span className="min-w-36 px-1 text-center text-sm font-medium text-white">{nomeDoMes(mes)}</span>
      {noFuturo ? (
        <span className="p-2 text-neutral-700" aria-hidden="true">
          <IconChevronRight width={16} height={16} />
        </span>
      ) : (
        <Link href={href(deslocarMes(mes, 1))} aria-label="Próximo mês" className="p-2 text-neutral-400 hover:text-white">
          <IconChevronRight width={16} height={16} />
        </Link>
      )}
    </div>
  );
}
