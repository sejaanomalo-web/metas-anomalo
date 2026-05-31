import { formatarMomentoBRT, tempoDecorrido } from "@/lib/sentinela"

/** Pílula compacta com status do Sentinela + última/próxima execução.
 *  Reutilizado em /dashboard/[empresa]/trafego, /clientes e /clientes/[cliente]. */
export default function BadgeStatusSentinela({
  statusCor,
  rotulo,
  ultimaExecucao,
  proximaLabelCompleto,
}: {
  statusCor: "success" | "warning" | "danger" | "neutral"
  rotulo: string
  ultimaExecucao: string | null
  proximaLabelCompleto: string
}) {
  const corMap = {
    success: { fg: "var(--success)", bg: "var(--success-bg)", border: "rgba(22,163,74,0.25)" },
    warning: { fg: "var(--warning)", bg: "var(--warning-bg)", border: "rgba(234,179,8,0.30)" },
    danger: { fg: "var(--danger)", bg: "var(--danger-bg)", border: "rgba(239,68,68,0.30)" },
    neutral: { fg: "var(--text-3)", bg: "rgba(255,255,255,0.04)", border: "rgba(255,255,255,0.08)" },
  }
  const c = corMap[statusCor]
  return (
    <div
      style={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: 4,
      }}
    >
      <span
        style={{
          fontSize: 11,
          color: c.fg,
          padding: "6px 12px",
          borderRadius: 999,
          background: c.bg,
          border: `1px solid ${c.border}`,
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        <Bolinha cor={c.fg} pulse={statusCor === "success"} />
        🛡️ {rotulo}
        {ultimaExecucao && (
          <span style={{ color: "var(--text-3)", marginLeft: 2 }}>
            · há {tempoDecorrido(ultimaExecucao)}
          </span>
        )}
      </span>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: 2,
          fontSize: 10,
          color: "var(--text-4)",
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1.4,
        }}
      >
        <span>
          última execução:{" "}
          {ultimaExecucao
            ? `${formatarMomentoBRT(ultimaExecucao)} BRT`
            : "·"}
        </span>
        <span>próxima execução: {proximaLabelCompleto}</span>
      </div>
    </div>
  )
}

function Bolinha({ cor, pulse }: { cor: string; pulse?: boolean }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: 6,
        height: 6,
        borderRadius: "50%",
        background: cor,
        boxShadow: pulse ? `0 0 0 0 ${cor}` : undefined,
        animation: pulse ? "pulseGold 2s ease-in-out infinite" : undefined,
      }}
    />
  )
}
