import {
  type EtapaFunil,
  formatBRL,
  formatNumero,
} from "@/lib/data"

interface Props {
  etapas: EtapaFunil[]
  reais?: Partial<Record<string, number>>
}

function formatar(v: number, tipo: "moeda" | "numero") {
  return tipo === "moeda" ? formatBRL(v) : formatNumero(v)
}

export default function FunilCascata({ etapas, reais }: Props) {
  return (
    <div className="card p-6">
      <div className="flex items-baseline justify-between mb-5">
        <p className="text-xs uppercase tracking-widest text-neutral-500">
          Funil do mês
        </p>
        <div className="flex items-center gap-4 text-[10px] uppercase tracking-widest">
          <span className="flex items-center gap-1.5 text-gold">
            <span className="h-2 w-2 rounded-full bg-gold" /> Meta
          </span>
          <span className="flex items-center gap-1.5 text-white">
            <span className="h-2 w-2 rounded-full bg-white" /> Real
          </span>
        </div>
      </div>

      <div className="space-y-2.5">
        {etapas.map((etapa, i) => {
          const prev = i > 0 ? etapas[i - 1] : null
          const conv =
            prev && prev.valor > 0 && prev.tipo === etapa.tipo
              ? Math.round((etapa.valor / prev.valor) * 100)
              : null
          const real = reais?.[etapa.chave]
          const temReal = typeof real === "number" && !Number.isNaN(real)

          const largura = Math.max(20, 100 - i * 12)

          return (
            <div key={etapa.chave} className="relative">
              <div
                className="mx-auto rounded-lg border border-gold/30 bg-black/40 px-4 py-3"
                style={{ width: `${largura}%` }}
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="text-sm text-white">
                    <span className="mr-2">{etapa.rotulo}</span>
                    {etapa.subtitulo && (
                      <span className="text-[11px] text-neutral-500">
                        · {etapa.subtitulo}
                      </span>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium text-gold">
                      {formatar(etapa.valor, etapa.tipo)}
                    </div>
                    {temReal && (
                      <div
                        className={`text-xs font-medium ${
                          real >= etapa.valor ? "text-emerald-400" : "text-red-400"
                        }`}
                      >
                        Real: {formatar(real, etapa.tipo)}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {conv !== null && i > 0 && (
                <div className="text-center -mt-1">
                  <span className="text-[10px] uppercase tracking-widest text-neutral-500">
                    ↓ {conv}% conversão
                  </span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
