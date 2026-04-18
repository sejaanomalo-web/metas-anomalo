import { type EtapaFunil, formatBRL, formatNumero } from "@/lib/data"

interface Props {
  etapas: EtapaFunil[]
  reais?: Partial<Record<string, number>>
}

function formatar(v: number, tipo: "moeda" | "numero") {
  return tipo === "moeda" ? formatBRL(v) : formatNumero(v)
}

const CHAVES_COM_CONVERSAO = new Set(["reunioes", "contratos"])

export default function FunilCascata({ etapas, reais }: Props) {
  return (
    <section>
      <p className="text-xs uppercase tracking-widest text-neutral-500 mb-4">
        Funil do mês
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {etapas.map((etapa, i) => {
          const prev = i > 0 ? etapas[i - 1] : null
          const conv =
            CHAVES_COM_CONVERSAO.has(etapa.chave) &&
            prev &&
            prev.valor > 0 &&
            prev.tipo === etapa.tipo
              ? Math.round((etapa.valor / prev.valor) * 100)
              : null

          const real = reais?.[etapa.chave]
          const temReal = typeof real === "number" && !Number.isNaN(real)
          const isFaturamento = etapa.chave === "faturamento"
          const acima = temReal && real >= etapa.valor
          const abaixo = temReal && real < etapa.valor

          const corReal = acima ? "#4caf50" : abaixo ? "#e24b4a" : "#ffffff"

          return (
            <div
              key={etapa.chave}
              className="rounded-lg p-4"
              style={{
                background: isFaturamento ? "#0f0c00" : "#111111",
                border: isFaturamento
                  ? "1px solid #C9953A"
                  : "0.5px solid #1e1e1e",
              }}
            >
              <p
                className="uppercase font-medium"
                style={{
                  fontSize: 10,
                  letterSpacing: "0.14em",
                  color: "#555",
                }}
              >
                {etapa.rotulo}
              </p>

              <div className="mt-3" style={{ minHeight: 30 }}>
                {temReal ? (
                  <p
                    className="font-medium leading-none"
                    style={{ fontSize: 26, color: corReal }}
                  >
                    {formatar(real, etapa.tipo)}
                  </p>
                ) : (
                  <p
                    className="italic leading-none"
                    style={{ fontSize: 13, color: "#333" }}
                  >
                    Não inserido
                  </p>
                )}
              </div>

              <div
                className="my-4"
                style={{
                  height: 1,
                  background: isFaturamento ? "#1a1400" : "#1a1a1a",
                }}
              />

              <div className="flex items-baseline justify-between">
                <span
                  className="uppercase"
                  style={{
                    fontSize: 10,
                    letterSpacing: "0.14em",
                    color: "#333",
                  }}
                >
                  Estimado
                </span>
                <span
                  style={{
                    fontSize: 13,
                    color: isFaturamento ? "#5a4a00" : "#3a3a3a",
                  }}
                >
                  {formatar(etapa.valor, etapa.tipo)}
                </span>
              </div>

              {(etapa.subtitulo || conv !== null) && (
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span style={{ fontSize: 10, color: "#2a2a2a" }}>
                    {etapa.subtitulo ?? ""}
                  </span>
                  {conv !== null && (
                    <span style={{ fontSize: 10, color: "#2a2a2a" }}>
                      {conv}% conv.
                    </span>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
