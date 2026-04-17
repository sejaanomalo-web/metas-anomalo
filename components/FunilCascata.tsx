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
      <p
        style={{
          fontSize: 8,
          letterSpacing: "2px",
          color: "#202020",
          textTransform: "uppercase",
          fontWeight: 400,
          marginBottom: 10,
        }}
      >
        Funil do mês
      </p>
      <div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
        style={{ gap: 8 }}
      >
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

          const corReal = acima ? "#4caf50" : abaixo ? "#e24b4a" : "#e0e0e0"

          return (
            <div
              key={etapa.chave}
              style={{
                background: isFaturamento ? "#0f0c00" : "#0c0c0c",
                border: `0.5px solid ${isFaturamento ? "#C9953A" : "#141414"}`,
                borderRadius: 10,
                padding: 16,
              }}
            >
              <p
                style={{
                  fontSize: 8,
                  letterSpacing: "2px",
                  color: "#555",
                  textTransform: "uppercase",
                  fontWeight: 400,
                }}
              >
                {etapa.rotulo}
              </p>

              <div style={{ marginTop: 12, minHeight: 28 }}>
                {temReal ? (
                  <p
                    className="font-mono"
                    style={{
                      fontSize: 26,
                      color: corReal,
                      fontWeight: 300,
                      letterSpacing: "-0.5px",
                      lineHeight: 1,
                    }}
                  >
                    {formatar(real, etapa.tipo)}
                  </p>
                ) : (
                  <p
                    style={{
                      fontSize: 13,
                      color: "#333",
                      fontStyle: "italic",
                      fontWeight: 300,
                      lineHeight: 1,
                    }}
                  >
                    Não inserido
                  </p>
                )}
              </div>

              <div
                style={{
                  height: 0.5,
                  background: isFaturamento ? "#1a1400" : "#1a1a1a",
                  margin: "14px 0 10px",
                }}
              />

              <div className="flex items-baseline justify-between">
                <span
                  style={{
                    fontSize: 8,
                    letterSpacing: "2px",
                    color: "#333",
                    textTransform: "uppercase",
                    fontWeight: 400,
                  }}
                >
                  Estimado
                </span>
                <span
                  className="font-mono"
                  style={{
                    fontSize: 13,
                    color: isFaturamento ? "#5a4a00" : "#3a3a3a",
                    fontWeight: 300,
                    letterSpacing: "-0.5px",
                  }}
                >
                  {formatar(etapa.valor, etapa.tipo)}
                </span>
              </div>

              {(etapa.subtitulo || conv !== null) && (
                <div
                  className="flex items-center justify-between"
                  style={{ marginTop: 6 }}
                >
                  <span
                    style={{ fontSize: 9, color: "#2a2a2a", fontWeight: 300 }}
                  >
                    {etapa.subtitulo ?? ""}
                  </span>
                  {conv !== null && (
                    <span
                      className="font-mono"
                      style={{ fontSize: 9, color: "#2a2a2a", fontWeight: 300 }}
                    >
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
