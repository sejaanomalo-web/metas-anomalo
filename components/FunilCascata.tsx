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
          fontSize: 9,
          letterSpacing: "2px",
          color: "rgba(255,255,255,0.35)",
          textTransform: "uppercase",
          fontWeight: 500,
          marginBottom: 14,
        }}
      >
        Funil do mês
      </p>
      <div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
        style={{ gap: 12 }}
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
          const acima = temReal && real >= etapa.valor
          const abaixo = temReal && real < etapa.valor
          const corReal = acima ? "#4caf50" : abaixo ? "#e24b4a" : "#ffffff"

          return (
            <div
              key={etapa.chave}
              className="glass"
              style={{ padding: 18 }}
            >
              <p
                style={{
                  fontSize: 9,
                  letterSpacing: "2px",
                  color: "rgba(255,255,255,0.35)",
                  textTransform: "uppercase",
                  fontWeight: 500,
                }}
              >
                {etapa.rotulo}
              </p>

              <div style={{ marginTop: 12, minHeight: 32 }}>
                {temReal ? (
                  <p
                    style={{
                      fontSize: 24,
                      color: corReal,
                      fontWeight: 600,
                      lineHeight: 1,
                      letterSpacing: "-0.3px",
                    }}
                  >
                    {formatar(real, etapa.tipo)}
                  </p>
                ) : (
                  <p
                    style={{
                      fontSize: 14,
                      color: "rgba(255,255,255,0.18)",
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
                className="divider-h"
                style={{ margin: "14px 0 10px" }}
              />

              <div className="flex items-baseline justify-between">
                <span
                  style={{
                    fontSize: 9,
                    letterSpacing: "2px",
                    color: "rgba(255,255,255,0.3)",
                    textTransform: "uppercase",
                    fontWeight: 500,
                  }}
                >
                  Meta
                </span>
                <span
                  style={{
                    fontSize: 14,
                    color: "#C9953A",
                    fontWeight: 500,
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
                    style={{
                      fontSize: 10,
                      color: "rgba(255,255,255,0.25)",
                      fontWeight: 300,
                    }}
                  >
                    {etapa.subtitulo ?? ""}
                  </span>
                  {conv !== null && (
                    <span
                      style={{
                        fontSize: 10,
                        color: "rgba(255,255,255,0.25)",
                        fontWeight: 400,
                      }}
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
