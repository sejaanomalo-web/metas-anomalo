import { formatNumero } from "@/lib/data"
import type { ResumoTrafego } from "@/lib/sentinela"

/**
 * Funil de CONVERSÃO do tráfego — do anúncio (Alcance) à venda. Barras
 * horizontais cuja largura cresce com o volume da etapa, formando degraus do
 * topo ao fundo. Como o tráfego cai ordens de magnitude (Alcance >> Vendas),
 * a largura usa escala LOGARÍTMICA: a linear achataria tudo num degrau só.
 * Etapa em zero fica na largura-base (LARG_MIN). Estilo aprovado: rótulo à
 * esquerda · chip colorido com o número · trilho escuro. Vai entre os cartões
 * de métrica e os gráficos.
 *
 * Etapas (cada dashboard mostra os próprios números, mesmo ResumoTrafego do
 * painel):
 *   Alcance · Cliques · Conversas        → do Meta (Sentinela)
 *   Agendamentos · Realizados · Vendas   → manuais (gestor)
 *
 * Mapeamento de dados:
 *   Agendamentos = reunioes_agendadas_real · Realizados = reunioes_real
 *   (=realizadas) · Vendas = contratos_real.
 */

type Etapa = { label: string; valor: number; cor: string }

const MIN_CHIP_PX = 96 // piso em px: número legível mesmo em telas estreitas
const LARG_MIN = 22 // largura-base (%) do chip: etapa em zero e piso do afunilamento

export default function FunilConversaoTrafego({
  resumo,
}: {
  resumo: ResumoTrafego
}) {
  const etapas: Etapa[] = [
    { label: "Alcance", valor: resumo.alcance, cor: "#5b8cff" },
    { label: "Cliques", valor: resumo.cliques, cor: "#6c7bff" },
    { label: "Conversas/form.", valor: resumo.resultados, cor: "#a855f7" },
    { label: "Agendamentos", valor: resumo.reunioesAgendadas, cor: "#f5b13d" },
    { label: "Realizados", valor: resumo.reunioes, cor: "#34c759" },
    { label: "Vendas", valor: resumo.contratos, cor: "#C9953A" },
  ]
  const maxV = Math.max(...etapas.map((e) => e.valor), 1)

  return (
    <section className="glass" style={{ padding: 24 }}>
      <div
        style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}
      >
        <span style={{ color: "#5b8cff", display: "inline-flex" }} aria-hidden="true">
          <IconePulso />
        </span>
        <h2 style={{ fontSize: 18, fontWeight: 600 }}>Funil de conversão</h2>
      </div>
      <p style={{ fontSize: 13, color: "var(--text-3)" }}>Do anúncio à venda</p>

      <div
        style={{
          height: 1,
          background: "rgba(255,255,255,0.06)",
          margin: "18px 0",
        }}
      />

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {etapas.map((e) => {
          // Largura do chip por escala log (degraus mesmo com Alcance >> Vendas);
          // valor 0 -> LARG_MIN (largura-base); a maior etapa -> 100%.
          const ratio = Math.log(e.valor + 1) / Math.log(maxV + 1)
          const pct = LARG_MIN + ratio * (100 - LARG_MIN)
          return (
            <div
              key={e.label}
              style={{ display: "flex", alignItems: "center", gap: 16 }}
            >
              <span
                className="funil-rotulo"
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--text-3)",
                }}
              >
                {e.label}
              </span>
              <div
                style={{
                  flex: 1,
                  position: "relative",
                  height: 48,
                  borderRadius: 12,
                  background: "rgba(255,255,255,0.035)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: `max(${pct}%, ${MIN_CHIP_PX}px)`,
                    borderRadius: 12,
                    background: `linear-gradient(135deg, ${e.cor}, ${escurecer(
                      e.cor
                    )})`,
                    boxShadow: `0 0 16px ${e.cor}40`,
                    display: "flex",
                    alignItems: "center",
                    paddingLeft: 18,
                  }}
                >
                  <span
                    style={{
                      fontSize: 16,
                      fontWeight: 700,
                      color: "#fff",
                      fontVariantNumeric: "tabular-nums",
                      textShadow: "0 1px 2px rgba(0,0,0,0.25)",
                    }}
                  >
                    {formatNumero(e.valor)}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

/** Escurece uma cor hex (#rrggbb) pro gradiente do chip. */
function escurecer(hex: string): string {
  const n = parseInt(hex.slice(1), 16)
  const r = Math.max(0, ((n >> 16) & 255) - 38)
  const g = Math.max(0, ((n >> 8) & 255) - 38)
  const b = Math.max(0, (n & 255) - 38)
  return `rgb(${r}, ${g}, ${b})`
}

function IconePulso() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  )
}
