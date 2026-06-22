/** Pílula que sinaliza a FONTE da coleta de tráfego de uma empresa,
 *  enquanto a ponte MCP substitui a Sentinela (app do Meta fora do ar):
 *    mcp          → âmbar    "via MCP"      (puxado pela ponte; aproximado)
 *    mcp_disabled → vermelho "MCP Disabled" (conta sem Ads MCP no Meta; sem coleta)
 *  null/undefined → não renderiza nada (coleta normal pela Sentinela).
 *
 *  Temporário: sai sozinho quando o app do Meta volta e a Sentinela
 *  reescreve os dias com coleta_status = null. */
export default function BadgeColeta({
  status,
}: {
  status?: "mcp" | "mcp_disabled" | null
}) {
  if (!status) return null

  const map = {
    mcp: {
      fg: "var(--accent)",
      bg: "rgba(255,255,255,0.04)",
      border: "rgba(255,255,255,0.12)",
      label: "MCP provisório",
      title:
        "Coleta provisória via MCP (conector Meta Ads) enquanto a Sentinela está fora (app do Meta apagado). Números aproximados — a Sentinela recalcula quando voltar.",
    },
    mcp_disabled: {
      fg: "var(--danger)",
      bg: "var(--danger-bg)",
      border: "rgba(239,68,68,0.30)",
      label: "MCP Disabled",
      title:
        "Conta ainda não liberada pelo Meta para Ads MCP (rollout gradual). Sem coleta de dados até o Meta habilitar.",
    },
  } as const

  const c = map[status]
  return (
    <span
      title={c.title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        color: c.fg,
        background: c.bg,
        border: `1px solid ${c.border}`,
        padding: "3px 9px",
        borderRadius: 999,
        whiteSpace: "nowrap",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: c.fg,
          flexShrink: 0,
        }}
      />
      {c.label}
    </span>
  )
}
