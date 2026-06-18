"use client"

import { useMemo, useState } from "react"
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts"
import { formatBRL } from "@/lib/data"
import type { LinhaDRE } from "@/lib/financeiro"

/**
 * Divisão de GASTOS por categoria (donut). Mostra, para o período global
 * selecionado, quanto cada categoria pesa no total. Toggle Despesas/Receitas
 * (default Despesas, foco em "gastos"). Alimentado pelo DRE do período
 * (getDREPeriodo) — então responde ao seletor de período do topo.
 */

interface TooltipPayload {
  name: string
  value: number
  payload: LinhaDRE & { pct: number }
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: TooltipPayload[]
}) {
  if (!active || !payload || payload.length === 0) return null
  const p = payload[0]
  return (
    <div
      style={{
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: "10px 14px",
        boxShadow: "0px 8px 50px 0px rgba(66, 74, 83, 0.15)",
        fontSize: 12,
        minWidth: 160,
      }}
    >
      <p style={{ fontWeight: 600, color: "var(--foreground)", marginBottom: 4 }}>
        {p.name}
      </p>
      <p style={{ color: "var(--muted-foreground)", fontVariantNumeric: "tabular-nums" }}>
        {formatBRL(p.value)} · {p.payload.pct.toFixed(1)}%
      </p>
    </div>
  )
}

function botaoToggle(ativo: boolean): React.CSSProperties {
  return {
    padding: "6px 14px",
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.02em",
    borderRadius: 8,
    cursor: "pointer",
    color: ativo ? "#0b0b0d" : "var(--text-3)",
    background: ativo ? "var(--accent, #C9953A)" : "transparent",
    border: ativo
      ? "1px solid var(--accent, #C9953A)"
      : "1px solid var(--surface-3, #2a2a30)",
  }
}

export default function GraficoCategorias({
  despesas,
  receitas,
  totalDespesas,
  totalReceitas,
  rotulo,
}: {
  despesas: LinhaDRE[]
  receitas: LinhaDRE[]
  totalDespesas: number
  totalReceitas: number
  rotulo: string
}) {
  const [tipo, setTipo] = useState<"despesa" | "receita">("despesa")

  const linhas = tipo === "despesa" ? despesas : receitas
  const total = tipo === "despesa" ? totalDespesas : totalReceitas

  const dados = useMemo(
    () =>
      linhas
        .filter((l) => l.total > 0)
        .map((l) => ({
          ...l,
          pct: total > 0 ? (l.total / total) * 100 : 0,
        })),
    [linhas, total]
  )

  const temDados = dados.length > 0

  return (
    <div
      className="glass"
      style={{
        padding: "20px 24px",
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <p
            style={{
              fontSize: 11,
              fontWeight: 500,
              color: "var(--muted-foreground)",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            {tipo === "despesa" ? "Gastos" : "Receitas"} por categoria · {rotulo}
          </p>
          <h3 style={{ fontSize: 18, marginTop: 4 }}>
            {tipo === "despesa"
              ? "Para onde o dinheiro está indo"
              : "De onde a receita está vindo"}
          </h3>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setTipo("despesa")}
            style={botaoToggle(tipo === "despesa")}
            className="no-ds"
          >
            Despesas
          </button>
          <button
            type="button"
            onClick={() => setTipo("receita")}
            style={botaoToggle(tipo === "receita")}
            className="no-ds"
          >
            Receitas
          </button>
        </div>
      </div>

      {!temDados ? (
        <div
          style={{
            padding: "48px 24px",
            textAlign: "center",
            color: "var(--muted-foreground)",
            fontSize: 14,
          }}
        >
          Nenhuma {tipo === "despesa" ? "despesa" : "receita"} realizada no período.
        </div>
      ) : (
        <div
          className="grid grid-cols-1 sm:grid-cols-[240px_minmax(0,1fr)] items-center"
          style={{ gap: 24 }}
        >
          {/* Donut */}
          <div style={{ width: "100%", height: 240, position: "relative" }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={dados}
                  dataKey="total"
                  nameKey="categoria_nome"
                  cx="50%"
                  cy="50%"
                  innerRadius="62%"
                  outerRadius="92%"
                  paddingAngle={dados.length > 1 ? 2 : 0}
                  stroke="var(--card)"
                  strokeWidth={2}
                  isAnimationActive={false}
                >
                  {dados.map((l, i) => (
                    <Cell key={`${l.categoria_id ?? "null"}|${i}`} fill={l.cor} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                pointerEvents: "none",
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  color: "var(--muted-foreground)",
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                }}
              >
                Total
              </span>
              <span
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  fontVariantNumeric: "tabular-nums",
                  color:
                    tipo === "despesa" ? "var(--destructive)" : "var(--success)",
                }}
              >
                {formatBRL(total)}
              </span>
            </div>
          </div>

          {/* Legenda detalhada */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {dados.map((l, i) => (
              <div
                key={`${l.categoria_id ?? "null"}|${i}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  fontSize: 13,
                }}
              >
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: l.cor,
                    flexShrink: 0,
                  }}
                />
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {l.categoria_nome}
                </span>
                <span
                  style={{
                    color: "var(--muted-foreground)",
                    fontVariantNumeric: "tabular-nums",
                    fontSize: 12,
                  }}
                >
                  {l.pct.toFixed(1)}%
                </span>
                <span
                  style={{
                    fontWeight: 600,
                    fontVariantNumeric: "tabular-nums",
                    minWidth: 84,
                    textAlign: "right",
                  }}
                >
                  {formatBRL(l.total)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
