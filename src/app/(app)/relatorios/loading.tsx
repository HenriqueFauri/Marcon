// Esqueleto de Relatórios: abas, período, cartões de destaque e o gráfico, na mesma ordem da tela.
export default function Loading() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="Carregando relatórios">
      <div className="mb-6 h-8 w-44 rounded-lg bg-fill" />
      <div className="mb-4 h-10 w-full rounded-full bg-fill sm:w-96" />
      <div className="mb-6 h-[74px] w-full rounded-2xl bg-fill sm:h-10 sm:max-w-xl sm:rounded-full" />
      <div className="mb-7 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <div className="hairline col-span-2 h-28 rounded-3xl bg-surface lg:col-span-1" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="hairline h-28 rounded-3xl bg-surface" />
        ))}
      </div>
      <div className="mb-1.5 h-3 w-20 rounded bg-fill" />
      <div className="hairline mb-7 h-72 rounded-3xl bg-surface" />
      <div className="grid grid-cols-1 gap-7 lg:grid-cols-2">
        <div className="hairline h-64 rounded-3xl bg-surface" />
        <div className="hairline h-64 rounded-3xl bg-surface" />
      </div>
    </div>
  );
}
