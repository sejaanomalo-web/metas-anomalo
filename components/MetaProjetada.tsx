import CardMetrica from "./CardMetrica"

export default function MetaProjetada({
  cards,
}: {
  cards: { titulo: string; valor: string; hint?: string }[]
}) {
  return (
    <div className="card p-6">
      <p className="text-xs uppercase tracking-widest text-neutral-500 mb-4">
        Meta Projetada
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {cards.map((c) => (
          <div
            key={c.titulo}
            className="rounded-lg bg-black/40 border border-neutral-900 p-3"
          >
            <p className="text-[10px] uppercase tracking-widest text-neutral-500">
              {c.titulo}
            </p>
            <p className="mt-1.5 text-base font-medium text-white">{c.valor}</p>
            {c.hint && (
              <p className="text-[11px] text-gold/80 mt-0.5">{c.hint}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// Overload to keep CardMetrica usable elsewhere
export { CardMetrica }
