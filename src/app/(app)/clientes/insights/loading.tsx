export default function Loading() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="Carregando clientes">
      <div className="mb-6 h-8 w-32 rounded-lg bg-fill" />
      <div className="mb-6 h-10 w-full rounded-full bg-fill sm:w-80" />
      <div className="mb-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="hairline h-24 rounded-3xl bg-surface" />
        ))}
      </div>
      <div className="hairline mb-7 h-56 rounded-3xl bg-surface" />
      <div className="hairline h-64 rounded-3xl bg-surface" />
    </div>
  );
}
