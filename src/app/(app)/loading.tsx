export default function Loading() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="Carregando">
      <div className="mb-2 h-6 w-40 rounded bg-fill" />
      <div className="mb-6 h-4 w-64 rounded bg-surface" />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 rounded-3xl bg-surface" />
        ))}
      </div>
      <div className="h-64 rounded-3xl bg-surface" />
    </div>
  );
}
