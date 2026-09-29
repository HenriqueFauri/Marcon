export default function Loading() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="Carregando">
      <div className="mb-2 h-6 w-40 rounded bg-neutral-800" />
      <div className="mb-6 h-4 w-64 rounded bg-neutral-900" />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 rounded-xl bg-neutral-900" />
        ))}
      </div>
      <div className="h-64 rounded-xl bg-neutral-900" />
    </div>
  );
}
