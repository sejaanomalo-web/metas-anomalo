import { formatNumero } from "@/lib/data"

interface Etapa {
  rotulo: string
  valor: number
}

export default function FunilVisual({
  etapas,
  titulo,
}: {
  etapas: Etapa[]
  titulo?: string
}) {
  const max = Math.max(...etapas.map((e) => e.valor), 1)

  return (
    <div className="card p-6">
      <p className="text-xs uppercase tracking-widest text-neutral-500 mb-4">
        {titulo ?? "Funil do mês"}
      </p>
      <div className="space-y-3">
        {etapas.map((etapa, i) => {
          const largura = Math.max(6, (etapa.valor / max) * 100)
          const anterior = i > 0 ? etapas[i - 1].valor : null
          const conv =
            anterior && anterior > 0
              ? Math.round((etapa.valor / anterior) * 100)
              : null

          return (
            <div key={etapa.rotulo}>
              <div className="flex items-baseline justify-between text-sm">
                <span className="text-white">{etapa.rotulo}</span>
                <span className="text-gold font-medium">
                  {formatNumero(etapa.valor)}
                  {conv !== null && (
                    <span className="text-neutral-500 text-xs ml-2">
                      ({conv}% conv.)
                    </span>
                  )}
                </span>
              </div>
              <div className="mt-1.5 h-3 rounded-md bg-neutral-900 overflow-hidden">
                <div
                  className="h-full gold-gradient"
                  style={{ width: `${largura}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
