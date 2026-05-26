export type ProgressStatus = "neutral" | "success" | "warning" | "danger" | "gold"

const STATUS_COLOR: Record<ProgressStatus, string> = {
  neutral: "rgba(199, 205, 217, 0.45)",
  success: "#16a34a",
  warning: "#eab308",
  danger: "#ef4444",
  gold: "#C9953A",
}

/**
 * Barra de progresso slim com status semântico.
 * Padrão: 4px de altura, raio total. Aceita `mostrarNumero` pra exibir
 * o % à direita usando a mesma cor do status.
 */
export default function ProgressBar({
  pct,
  status = "neutral",
  height = 4,
  mostrarNumero = false,
  className,
}: {
  pct: number
  status?: ProgressStatus
  height?: number
  mostrarNumero?: boolean
  className?: string
}) {
  const cor = STATUS_COLOR[status]
  const clamped = Math.max(0, Math.min(100, Math.round(pct)))
  return (
    <div
      className={className}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}
    >
      <div
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        style={{
          flex: 1,
          height,
          background: "rgba(255, 255, 255, 0.06)",
          borderRadius: height,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${clamped}%`,
            background: cor,
            borderRadius: height,
            transition: "width 0.3s ease",
          }}
        />
      </div>
      {mostrarNumero && (
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: cor,
            minWidth: 36,
            textAlign: "right",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {clamped}%
        </span>
      )}
    </div>
  )
}
