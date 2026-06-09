import { Fragment } from "react"
import { formatBRL, formatNumero } from "@/lib/data"
import type { ResumoComercial } from "@/lib/comercial-tipos"

/**
 * Funil de ATIVIDADE comercial do período — representação VISUAL (barras que
 * afunilam) da BOCA do funil (mensagens enviadas) até o FUNDO (contratos),
 * com o faturamento gerado como resultado final. Sequência:
 *   Mensagens → Retorno → Qualificados → Agendamentos → Reuniões → Contratos
 * + Faturamento (R$, resultado dos contratos).
 *
 * "Agendamentos" (reuniões agendadas) entra entre Qualificados e Reuniões
 * (realizadas) — a conversão Agendamentos→Reuniões é o comparecimento.
 *
 * Largura de cada barra proporcional ao volume da etapa: a razão valor/maior
 * é mapeada pra faixa [LARG_MIN, 100]%, dando a forma do funil — topo mais
 * largo, estreitando até o fundo; etapa em zero fica no tamanho-padrão
 * (LARG_MIN). Mostra a conversão de cada passo. Mesmo design system das demais
 * telas (.glass, accent ouro, gradientes dos cartões de tráfego). Dados de
 * relatorios_comerciais.
 */

type Etapa = {
  label: string
  valor: number
  cor: string
  sub?: string
  destaque?: boolean
}

const LARG_MIN = 34 // largura-base (%) das etapas em zero e piso do afunilamento

export default function FunilAtividadeComercial({
  resumo,
}: {
  resumo: ResumoComercial
}) {
  const semDados = resumo.registros === 0

  const etapas: Etapa[] = [
    {
      label: "Mensagens enviadas",
      valor: resumo.mensagens,
      cor: "#4062f0",
      sub: "boca do funil",
    },
    {
      label: "Retorno",
      valor: resumo.retorno_mensagens,
      cor: "#6366f1",
      sub: "responderam",
    },
    {
      label: "Qualificados",
      valor: resumo.qualificados,
      cor: "#8b5cf6",
      sub: "qualificados",
    },
    {
      label: "Agendamentos",
      valor: resumo.reunioes_agendadas,
      cor: "#a855f7",
      sub: "reuniões agendadas",
    },
    {
      label: "Reuniões",
      valor: resumo.reunioes_realizadas,
      cor: "#f97316",
      sub: `${formatNumero(resumo.no_shows)} no-show`,
    },
    {
      label: "Contratos",
      valor: resumo.contratos_fechados,
      cor: "#34c759",
      sub: `${formatNumero(resumo.propostas_enviadas)} propostas`,
      destaque: true,
    },
  ]

  const denom = Math.max(...etapas.map((e) => e.valor), 1)

  return (
    <div style={{ maxWidth: 720, marginInline: "auto", width: "100%" }}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 6,
        }}
      >
        {etapas.map((e, i) => {
          // Largura proporcional: razão valor/maior mapeada pra [LARG_MIN, 100]%.
          // valor 0 -> LARG_MIN (tamanho-padrão); a maior etapa -> 100%.
          const ratio = e.valor / denom
          const pct = LARG_MIN + ratio * (100 - LARG_MIN)
          const prev = i > 0 ? etapas[i - 1] : null
          const conv =
            prev && prev.valor > 0
              ? Math.round((e.valor / prev.valor) * 100)
              : null

          return (
            <Fragment key={e.label}>
              {i > 0 && (
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--text-4)",
                    fontVariantNumeric: "tabular-nums",
                    lineHeight: 1,
                  }}
                >
                  ↓ {conv === null ? "—" : `${conv}%`}
                </div>
              )}
              <div
                style={{
                  width: semDados ? "100%" : `${pct}%`,
                  minWidth: 200,
                  borderRadius: 12,
                  padding: "12px 18px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 14,
                  minHeight: 56,
                  background: semDados
                    ? "var(--card-bg)"
                    : `linear-gradient(135deg, ${e.cor}, ${escurecer(e.cor)})`,
                  border: e.destaque
                    ? "1px solid rgba(201,149,58,0.55)"
                    : semDados
                    ? "1px solid var(--card-border)"
                    : "1px solid rgba(255,255,255,0.12)",
                  boxShadow: semDados ? "none" : `0 0 18px ${e.cor}33`,
                  transition: "width 0.3s ease",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <p
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      letterSpacing: "0.01em",
                      color: semDados ? "var(--text-3)" : "#fff",
                      textShadow: semDados ? "none" : "0 1px 2px rgba(0,0,0,0.25)",
                    }}
                  >
                    {e.label}
                  </p>
                  {e.sub && (
                    <p
                      style={{
                        fontSize: 10,
                        marginTop: 2,
                        color: semDados
                          ? "var(--text-4)"
                          : "rgba(255,255,255,0.78)",
                      }}
                    >
                      {e.sub}
                    </p>
                  )}
                </div>
                <p
                  style={{
                    fontSize: 22,
                    fontWeight: 700,
                    fontVariantNumeric: "tabular-nums",
                    color: semDados ? "var(--text-4)" : "#fff",
                    textShadow: semDados ? "none" : "0 1px 2px rgba(0,0,0,0.25)",
                  }}
                >
                  {semDados ? "·" : formatNumero(e.valor)}
                </p>
              </div>
            </Fragment>
          )
        })}

        {/* Resultado: faturamento gerado pelos contratos (R$ — fora da taxa de
            contagem do funil; é a receita do fundo do funil). */}
        <div
          style={{
            fontSize: 11,
            color: "var(--text-4)",
            lineHeight: 1,
            marginTop: 2,
          }}
        >
          ↓ resultado
        </div>
        <div
          className="glass"
          style={{
            width: "100%",
            padding: "16px 20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 14,
            borderColor: "rgba(201,149,58,0.45)",
            background: semDados
              ? undefined
              : "linear-gradient(135deg, rgba(201,149,58,0.18), rgba(201,149,58,0.05))",
          }}
        >
          <div>
            <p
              style={{
                fontSize: 10,
                letterSpacing: "1px",
                textTransform: "uppercase",
                color: "var(--accent, #C9953A)",
                fontWeight: 600,
              }}
            >
              Faturamento gerado
            </p>
            <p style={{ fontSize: 11, color: "var(--text-4)", marginTop: 2 }}>
              fundo do funil · receita dos contratos
            </p>
          </div>
          <p
            style={{
              fontSize: 26,
              fontWeight: 700,
              fontVariantNumeric: "tabular-nums",
              color: semDados ? "var(--text-4)" : "var(--text-1)",
            }}
          >
            {semDados ? "·" : formatBRL(resumo.faturamento_gerado)}
          </p>
        </div>
      </div>
    </div>
  )
}

/** Escurece uma cor hex (#rrggbb) pro gradiente do fundo da barra. */
function escurecer(hex: string): string {
  const n = parseInt(hex.slice(1), 16)
  const r = Math.max(0, ((n >> 16) & 255) - 42)
  const g = Math.max(0, ((n >> 8) & 255) - 42)
  const b = Math.max(0, (n & 255) - 42)
  return `rgb(${r}, ${g}, ${b})`
}
