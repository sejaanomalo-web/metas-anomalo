import type { StatusCampanha } from "@/lib/clientes"
import { statusCampanhaRotulo } from "@/lib/clientes"

/** Pílula colorida do status das campanhas de um cliente, derivado
 *  pelo Sentinela a cada execução:
 *    ativo       → verde  (≥1 campanha ACTIVE)
 *    desativado  → cinza  (tem campanhas, nenhuma ativa)
 *    sem_conexao → vermelho (erro de coleta / token inválido)
 */
export default function TagStatusCampanha({ status }: { status: StatusCampanha }) {
  const map = {
    ativo: {
      fg: "var(--success)",
      bg: "var(--success-bg)",
      border: "rgba(22,163,74,0.30)",
      pulse: true,
    },
    desativado: {
      fg: "var(--text-3)",
      bg: "rgba(255,255,255,0.04)",
      border: "rgba(255,255,255,0.10)",
      pulse: false,
    },
    sem_conexao: {
      fg: "var(--danger)",
      bg: "var(--danger-bg)",
      border: "rgba(239,68,68,0.30)",
      pulse: false,
    },
  } as const
  const c = map[status]
  return (
    <span
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
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: c.fg,
          animation: c.pulse ? "pulseGold 2s ease-in-out infinite" : undefined,
          flexShrink: 0,
        }}
      />
      {statusCampanhaRotulo(status)}
    </span>
  )
}
