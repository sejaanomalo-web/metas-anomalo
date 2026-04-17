export default function CardMetrica({
  titulo,
  valor,
  hint,
}: {
  titulo: string
  valor: string
  hint?: string
}) {
  return (
    <div className="card p-5">
      <p className="text-xs uppercase tracking-widest text-neutral-500">
        {titulo}
      </p>
      <p className="mt-2 text-2xl font-medium text-white tracking-tight">
        {valor}
      </p>
      {hint && <p className="mt-1 text-xs text-gold/80">{hint}</p>}
    </div>
  )
}
