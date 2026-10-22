// Esqueletos de carregamento (loading.tsx). Mesma forma das telas: título, grupo branco de linhas.
export function EsqueletoLista({ linhas = 7, comBusca = true }: { linhas?: number; comBusca?: boolean }) {
  return (
    <div className="animate-pulse motion-reduce:animate-none" aria-busy="true" aria-label="Carregando">
      <div className="mb-5 h-8 w-40 rounded-lg bg-fill" />
      {comBusca && <div className="mb-4 h-11 w-full rounded-xl bg-fill sm:max-w-sm" />}
      <div className="hairline divide-y divide-line overflow-hidden rounded-3xl bg-surface">
        {Array.from({ length: linhas }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            <div className="h-9 w-9 shrink-0 rounded-lg bg-fill" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-4 w-3/5 rounded bg-fill" />
              <div className="h-3 w-2/5 rounded bg-fill" />
            </div>
            <div className="h-4 w-14 rounded bg-fill" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function EsqueletoDetalhe() {
  return (
    <div className="animate-pulse motion-reduce:animate-none" aria-busy="true" aria-label="Carregando">
      <div className="mb-5 h-8 w-56 rounded-lg bg-fill" />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="hairline h-20 rounded-3xl bg-surface" />
        ))}
      </div>
      <div className="hairline h-48 rounded-3xl bg-surface" />
    </div>
  );
}
