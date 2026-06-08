import { formatBRL, formatNumero } from "@/lib/data"
import {
  ETAPAS_FUNIL,
  ROTULO_ETAPA,
  type EtapaFunil,
  type OportunidadePipeline,
} from "@/lib/comercial-tipos"

/**
 * Funil comercial em blocos. Agrupa as oportunidades do pipeline por
 * etapa (lead → qualificado → reunião → proposta → fechado) mostrando
 * contagem e valor estimado somado por etapa. "perdido" fica de fora do
 * funil principal (exibido à parte como referência).
 */
export default function FunilComercial({
  oportunidades,
}: {
  oportunidades: OportunidadePipeline[]
}) {
  const porEtapa = new Map<EtapaFunil, { count: number; valor: number }>()
  for (const e of ETAPAS_FUNIL) porEtapa.set(e, { count: 0, valor: 0 })
  for (const o of oportunidades) {
    const slot = porEtapa.get(o.etapa)
    if (!slot) continue
    slot.count += 1
    slot.valor += Number(o.valor_estimado ?? 0)
  }

  const etapasFunil = ETAPAS_FUNIL.filter((e) => e !== "perdido")
  const maxCount = Math.max(
    1,
    ...etapasFunil.map((e) => porEtapa.get(e)?.count ?? 0)
  )
  const perdido = porEtapa.get("perdido")!

  return (
    <div className="space-y-4">
      <div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5"
        style={{ gap: 12 }}
      >
        {etapasFunil.map((etapa) => {
          const d = porEtapa.get(etapa)!
          const pct = Math.round((d.count / maxCount) * 100)
          return (
            <div
              key={etapa}
              className="glass"
              style={{ padding: "18px 16px", position: "relative" }}
            >
              <p
                style={{
                  fontSize: 10,
                  letterSpacing: "1px",
                  textTransform: "uppercase",
                  color: "var(--accent, #C9953A)",
                  fontWeight: 600,
                }}
              >
                {ROTULO_ETAPA[etapa]}
              </p>
              <p
                style={{
                  fontSize: 30,
                  fontWeight: 700,
                  marginTop: 6,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {formatNumero(d.count)}
              </p>
              <p style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>
                {formatBRL(d.valor)}
              </p>
              <div
                style={{
                  marginTop: 12,
                  height: 4,
                  borderRadius: 2,
                  background: "rgba(255,255,255,0.08)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${pct}%`,
                    height: "100%",
                    background: "var(--accent, #C9953A)",
                  }}
                />
              </div>
            </div>
          )
        })}
      </div>

      <p style={{ fontSize: 12, color: "var(--text-4)" }}>
        Perdidos no período: {formatNumero(perdido.count)} ·{" "}
        {formatBRL(perdido.valor)}
      </p>
    </div>
  )
}
