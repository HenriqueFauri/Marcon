export default function Loading() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="Carregando fechamento">
      <div className="mb-6 h-8 w-44 rounded-lg bg-fill" />
      <div className="mb-4 h-10 w-full rounded-full bg-fill sm:w-96" />
      <div className="mb-6 h-10 w-56 rounded-full bg-fill" />
      <div className="mb-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="hairline h-28 rounded-3xl bg-surface" />
        ))}
      </div>
      <div className="hairline mb-7 h-72 rounded-3xl bg-surface" />
      <div className="hairline h-64 rounded-3xl bg-surface" />
    </div>
  );
}
