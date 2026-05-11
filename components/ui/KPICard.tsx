import type { ReactNode } from "react"
import IconBadge, { type IconBadgeStatus } from "./IconBadge"
import ProgressBar, { type ProgressStatus } from "./ProgressBar"

/**
 * Card padrão de KPI no estilo dashboard SaaS:
 *
 *   ┌─────────────────────────────────────┐
 *   │ Label              [Icon Badge]    │
 *   │ R$ 419.555,00                       │
 *   │ ↑ 8.3% vs meta                      │
 *   │ ████████░░░░░░░░  68%               │  ← opcional
 *   └─────────────────────────────────────┘
 *
 * - Label sentence case (text-3)
 * - Número-chave grande (28–32px) em text-1, peso 700, tabular-nums
 * - Linha de delta com cor semântica
 * - Barra de progresso opcional embaixo
 * - Icon badge no canto superior direito (opcional)
 */
export default function KPICard({
  label,
  valor,
  icon,
  iconStatus = "neutral",
  delta,
  progresso,
  destaque = false,
  semDados = false,
  semDadosTexto = "Sem dados",
}: {
  label: string
  valor: string
  icon?: ReactNode
  iconStatus?: IconBadgeStatus
  delta?: { texto: string; status: "success" | "warning" | "danger" | "neutral" }
  progresso?: { pct: number; status: ProgressStatus; mostrarNumero?: boolean }
  destaque?: boolean
  semDados?: boolean
  semDadosTexto?: string
}) {
  const corDelta = (() => {
    if (!delta) return undefined
    if (delta.status === "success") return "var(--success)"
    if (delta.status === "warning") return "var(--warning)"
    if (delta.status === "danger") return "var(--danger)"
    return "var(--text-3)"
  })()

  return (
    <div
      className="glass"
      style={{
        padding: "20px 22px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        borderColor: destaque
          ? "rgba(201, 149, 58, 0.30)"
          : undefined,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <p
          style={{
            fontSize: 12,
            fontWeight: 500,
            color: "var(--text-3)",
            lineHeight: 1.3,
          }}
        >
          {label}
        </p>
        {icon && (
          <IconBadge status={iconStatus} size="md">
            {icon}
          </IconBadge>
        )}
      </div>

      <p
        style={{
          fontSize: 28,
          fontWeight: 700,
          color: semDados ? "var(--text-4)" : "var(--text-1)",
          lineHeight: 1.1,
          letterSpacing: "-0.015em",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {semDados ? "—" : valor}
      </p>

      {semDados && (
        <p
          style={{
            fontSize: 11,
            fontWeight: 400,
            color: "var(--text-4)",
            fontStyle: "italic",
          }}
        >
          {semDadosTexto}
        </p>
      )}

      {!semDados && delta && (
        <p
          style={{
            fontSize: 12,
            fontWeight: 500,
            color: corDelta,
            lineHeight: 1.3,
          }}
        >
          {delta.texto}
        </p>
      )}

      {!semDados && progresso && (
        <ProgressBar
          pct={progresso.pct}
          status={progresso.status}
          mostrarNumero={progresso.mostrarNumero}
        />
      )}
    </div>
  )
}
