import Link from "next/link";
import { MonthPicker } from "@/components/month-picker";
import { btnSecondary, inputClass } from "@/components/ui";
import { OPCOES_MESES, type PeriodoCaixa } from "@/lib/periodo";

const BASE = "/fluxo-de-caixa";

function href(params: Record<string, string | undefined>) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
  const s = qs.toString();
  return s ? `${BASE}?${s}` : BASE;
}

// Escolha do período: mês (com setas), últimos 3/6/12 meses ou datas livres.
export function PeriodoCaixaPicker({ periodo, tipo }: { periodo: PeriodoCaixa; tipo?: string }) {
  const chip = (ativo: boolean) =>
    `whitespace-nowrap rounded-full px-3.5 py-2 text-[13px] transition ${
      ativo ? "bg-surface font-semibold text-ink shadow-sm" : "font-medium text-ink-2 hover:text-ink"
    }`;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex max-w-full gap-0.5 overflow-x-auto rounded-full bg-fill p-[3px]" role="group" aria-label="Período">
        <Link href={href({ tipo })} className={chip(periodo.modo === "mes")}>
          Mês
        </Link>
        {OPCOES_MESES.map((m) => (
          <Link key={m} href={href({ meses: String(m), tipo })} className={chip(periodo.modo === "meses" && periodo.meses === m)}>
            {m} meses
          </Link>
        ))}
      </div>

      {periodo.modo === "mes" && <MonthPicker mes={periodo.mes} basePath={BASE} params={{ tipo }} />}

      <details open={periodo.modo === "intervalo"} className="group">
        <summary
          className={`inline-flex cursor-pointer list-none items-center rounded-full px-3.5 py-2 text-[13px] font-medium transition marker:hidden [&::-webkit-details-marker]:hidden ${
            periodo.modo === "intervalo" ? "bg-surface text-ink shadow-sm" : "bg-fill text-ink-2 hover:text-ink"
          }`}
        >
          Escolher datas
        </summary>
        <form action={BASE} method="get" className="mt-3 flex flex-wrap items-end gap-2">
          {tipo && <input type="hidden" name="tipo" value={tipo} />}
          <label className="block min-w-0 flex-1 basis-36">
            <span className="mb-1 block text-[13px] font-medium text-ink-muted">De</span>
            <input type="date" name="de" required defaultValue={periodo.de} className={inputClass} />
          </label>
          <label className="block min-w-0 flex-1 basis-36">
            <span className="mb-1 block text-[13px] font-medium text-ink-muted">Até</span>
            <input type="date" name="ate" required defaultValue={periodo.ate} className={inputClass} />
          </label>
          <button type="submit" className={btnSecondary}>
            Ver período
          </button>
        </form>
      </details>
    </div>
  );
}
