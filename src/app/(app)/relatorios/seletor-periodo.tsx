import Link from "next/link";
import { btnSecondary, inputClass } from "@/components/ui";
import { formatDataCurta } from "@/lib/format";
import { OPCOES_PERIODO, hrefRelatorio, type PeriodoRelatorio } from "@/lib/relatorios";

// Escolha do período, tudo na URL (funciona sem JavaScript e o link se compartilha). No celular
// as seis opções ficam em duas fileiras de três, para nenhuma rótulo cortar.
export function SeletorPeriodo({
  periodo,
  basePath,
  extra = {},
}: {
  periodo: PeriodoRelatorio;
  basePath: string;
  extra?: Record<string, string | undefined>;
}) {
  const href = (chave: string) => {
    if (chave === "custom") return hrefRelatorio(basePath, { ...periodo, chave: "custom" }, extra);
    return hrefRelatorio(basePath, { ...periodo, chave: chave as PeriodoRelatorio["chave"] }, extra);
  };
  const intervalo = `${formatDataCurta(periodo.de)} a ${formatDataCurta(periodo.ate)}`;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <nav aria-label="Período" className="grid grid-cols-3 gap-0.5 rounded-2xl bg-fill p-[3px] sm:max-w-xl sm:grid-cols-6 sm:rounded-full">
        {OPCOES_PERIODO.map((o) => {
          const ativo = periodo.chave === o.chave;
          return (
            <Link
              key={o.chave}
              href={href(o.chave)}
              replace
              aria-current={ativo ? "page" : undefined}
              className={`flex min-w-0 items-center justify-center rounded-xl px-1 py-2 text-[13px] transition sm:rounded-full ${
                ativo ? "bg-surface font-semibold text-ink shadow-sm" : "font-medium text-ink-2 hover:text-ink"
              }`}
            >
              <span className="truncate">{o.label}</span>
            </Link>
          );
        })}
      </nav>

      {periodo.chave === "custom" && (
        <form action={basePath} method="get" className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="p" value="custom" />
          {Object.entries(extra).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
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
      )}

      <p className="px-1 text-[13px] text-ink-muted">
        {intervalo} · comparando com {periodo.rotuloAnterior}
      </p>
    </div>
  );
}
