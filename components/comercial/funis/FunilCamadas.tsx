import { Fragment } from "react"
import { formatBRL, formatNumero } from "@/lib/data"
import { formatarPct, type ResumoFunil } from "@/lib/funil-calculo"

/**
 * Funil em camadas: cada etapa é uma barra com largura proporcional ao volume,
 * e entre duas barras aparece a taxa de passagem. O pior passo vem marcado como
 * gargalo. As cores saem de uma rampa fixa, para valer em funis de qualquer
 * tamanho.
 */

const RAMPA: [number, number, number][] = [
  [64, 98, 240],
  [139, 92, 246],
  [168, 85, 247],
  [249, 115, 22],
  [36, 150, 72],
]

/** Barra mais estreita, em %: abaixo disso o texto não cabe. */
const LARGURA_MINIMA = 34

function corDaEtapa(indice: number, total: number): string {
  const pos = total <= 1 ? 0 : (indice / (total - 1)) * (RAMPA.length - 1)
  const base = Math.floor(pos)
  const fim = Math.min(base + 1, RAMPA.length - 1)
  const t = pos - base
  const canal = (c: 0 | 1 | 2) =>
    Math.round(RAMPA[base][c] + (RAMPA[fim][c] - RAMPA[base][c]) * t)
  return `rgb(${canal(0)}, ${canal(1)}, ${canal(2)})`
}

export default function FunilCamadas({ resumo }: { resumo: ResumoFunil }) {
  const semDados = resumo.registros === 0
  const maior = Math.max(...resumo.etapas.map((e) => e.valor), 1)

  return (
    <div
      style={{
        maxWidth: 760,
        marginInline: "auto",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
      }}
    >
      {resumo.etapas.map((etapa, i) => {
        const largura =
          LARGURA_MINIMA + (etapa.valor / maior) * (100 - LARGURA_MINIMA)
        const cor = corDaEtapa(i, resumo.etapas.length)
        const ehGargalo = resumo.gargalo?.indice === i
        const detalhes = [
          i > 0 && etapa.conversaoTopo !== null
            ? `${formatarPct(etapa.conversaoTopo)} do topo`
            : null,
          etapa.custo !== null ? `${formatBRL(etapa.custo)} cada` : null,
        ].filter(Boolean)

        return (
          <Fragment key={etapa.id}>
            {i > 0 && (
              <div
                data-passo={etapa.nome}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  minHeight: 24,
                  fontSize: 13,
                  fontWeight: 600,
                  fontVariantNumeric: "tabular-nums",
                  color: ehGargalo ? "#fca5a5" : "var(--text-2)",
                }}
              >
                <span aria-hidden>↓</span>
                <span>
                  {etapa.conversaoAnterior === null
                    ? "sem base para calcular"
                    : `${formatarPct(etapa.conversaoAnterior)} avançaram`}
                </span>
                {ehGargalo && (
                  <span
                    style={{
                      padding: "2px 8px",
                      borderRadius: 999,
                      fontSize: 11,
                      fontWeight: 700,
                      color: "#fff",
                      background: "#b91c1c",
                    }}
                  >
                    Maior gargalo
                  </span>
                )}
              </div>
            )}
            <div
              data-etapa={etapa.nome}
              style={{
                width: semDados ? "100%" : `${largura}%`,
                minWidth: "min(240px, 100%)",
                minHeight: 60,
                padding: "11px 18px",
                borderRadius: 12,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 14,
                background: semDados ? "var(--card-bg)" : cor,
                border: semDados
                  ? "1px solid var(--card-border)"
                  : "1px solid rgba(255,255,255,0.12)",
                transition: "width 0.3s ease",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <p
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: semDados ? "var(--text-2)" : "#fff",
                  }}
                >
                  {etapa.nome}
                </p>
                {detalhes.length > 0 && (
                  <p
                    style={{
                      marginTop: 2,
                      fontSize: 11,
                      color: "rgba(255,255,255,0.88)",
                    }}
                  >
                    {detalhes.join(" · ")}
                  </p>
                )}
              </div>
              <p
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  fontVariantNumeric: "tabular-nums",
                  color: semDados ? "var(--text-3)" : "#fff",
                }}
              >
                {semDados ? "0" : formatNumero(etapa.valor)}
              </p>
            </div>
          </Fragment>
        )
      })}
    </div>
  )
}
