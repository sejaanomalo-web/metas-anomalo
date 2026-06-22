/** Selo que indica a FONTE da coleta de tráfego de uma empresa: só aparece
 *  quando os dados vêm do conector MCP (coleta na nuvem, enquanto o app do
 *  Meta está fora). Para coleta normal (Sentinela) ou contas sem MCP, não
 *  mostra nada — sem tag extra. */
export default function BadgeColeta({
  status,
}: {
  status?: "mcp" | "mcp_disabled" | null
}) {
  if (status !== "mcp") return null

  return (
    <span
      title="Fonte: MCP"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        color: "var(--accent)",
        background: "rgba(201,149,58,0.10)",
        border: "1px solid rgba(201,149,58,0.25)",
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
          background: "var(--accent)",
          flexShrink: 0,
        }}
      />
      MCP
    </span>
  )
}
