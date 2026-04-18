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
          fontSize: 11,
          letterSpacing: "1px",
          color: "#666",
          textTransform: "uppercase",
          fontWeight: 400,
          marginBottom: 12,
        }}
      >
        Funil do mês
      </p>
      <div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
        style={{ gap: 10 }}
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

          const corReal = acima ? "#4caf50" : abaixo ? "#e24b4a" : "#fff"

          return (
            <div
              key={etapa.chave}
              style={{
                background: isFaturamento ? "#0f0c00" : "#0c0c0c",
                border: `0.5px solid ${isFaturamento ? "#C9953A" : "#141414"}`,
                borderRadius: 10,
                padding: 18,
              }}
            >
              <p
                style={{
                  fontSize: 11,
                  letterSpacing: "1px",
                  color: "#666",
                  textTransform: "uppercase",
                  fontWeight: 400,
                }}
              >
                {etapa.rotulo}
              </p>

              <div style={{ marginTop: 12, minHeight: 30 }}>
                {temReal ? (
                  <p
                    style={{
                      fontSize: 24,
                      color: corReal,
                      fontWeight: 400,
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
                      fontWeight: 400,
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
                    fontSize: 11,
                    letterSpacing: "0.3px",
                    color: "#555",
                    textTransform: "uppercase",
                    fontWeight: 400,
                  }}
                >
                  Estimado
                </span>
                <span
                  style={{
                    fontSize: 14,
                    color: isFaturamento ? "#C9953A" : "#888",
                    fontWeight: 400,
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
                    style={{ fontSize: 11, color: "#555", fontWeight: 400 }}
                  >
                    {etapa.subtitulo ?? ""}
                  </span>
                  {conv !== null && (
                    <span
                      style={{ fontSize: 11, color: "#555", fontWeight: 400 }}
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
