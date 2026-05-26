import type { CSSProperties, ReactNode } from "react"

export type IconBadgeStatus = "neutral" | "success" | "warning" | "danger" | "gold"
export type IconBadgeSize = "sm" | "md" | "lg"

const STATUS_COLORS: Record<
  IconBadgeStatus,
  { fg: string; bg: string }
> = {
  neutral: { fg: "#c7cdd9", bg: "rgba(199, 205, 217, 0.10)" },
  success: { fg: "#16a34a", bg: "rgba(22, 163, 74, 0.12)" },
  warning: { fg: "#eab308", bg: "rgba(234, 179, 8, 0.12)" },
  danger: { fg: "#ef4444", bg: "rgba(239, 68, 68, 0.12)" },
  gold: { fg: "#C9953A", bg: "rgba(201, 149, 58, 0.12)" },
}

const SIZE_PX: Record<IconBadgeSize, { box: number; font: number }> = {
  sm: { box: 24, font: 12 },
  md: { box: 32, font: 14 },
  lg: { box: 40, font: 18 },
}

/**
 * Círculo arredondado com ícone/glifo dentro, fundo levemente colorido
 * conforme status. Usado no canto dos KPI cards e em contextos de
 * status visual.
 */
export default function IconBadge({
  children,
  status = "neutral",
  size = "md",
  style,
}: {
  children: ReactNode
  status?: IconBadgeStatus
  size?: IconBadgeSize
  style?: CSSProperties
}) {
  const colors = STATUS_COLORS[status]
  const dim = SIZE_PX[size]
  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: dim.box,
        height: dim.box,
        borderRadius: 12,
        background: colors.bg,
        color: colors.fg,
        fontSize: dim.font,
        lineHeight: 1,
        flexShrink: 0,
        ...style,
      }}
    >
      {children}
    </span>
  )
}
