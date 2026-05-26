"use client"

import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts"
import type { Mes } from "@/lib/data"
import { formatBRL } from "@/lib/data"

interface PontoFluxo {
  mes: Mes
  receitas: number
  despesas: number
  resultado: number
}

interface TooltipProps {
  active?: boolean
  payload?: { name: string; value: number; color?: string; payload?: PontoFluxo }[]
  label?: string
}

function CustomTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div
      style={{
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: "10px 14px",
        boxShadow: "0px 8px 50px 0px rgba(66, 74, 83, 0.15)",
        fontSize: 12,
        minWidth: 180,
      }}
    >
      <p style={{ fontWeight: 600, color: "var(--foreground)", marginBottom: 6 }}>
        {label}
      </p>
      {payload.map((p) => (
        <p
          key={p.name}
          style={{
            color: p.color ?? "var(--foreground)",
            marginBottom: 2,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {p.name}: {formatBRL(p.value)}
        </p>
      ))}
    </div>
  )
}

export default function GraficoFluxoCaixa({
  dados,
  ano,
}: {
  dados: PontoFluxo[]
  ano: number
}) {
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
      <div>
        <p
          style={{
            fontSize: 11,
            fontWeight: 500,
            color: "var(--muted-foreground)",
            letterSpacing: "0.04em",
          }}
        >
          FLUXO DE CAIXA · {ano}
        </p>
        <h3 style={{ fontSize: 18, marginTop: 4 }}>Receitas, despesas e resultado mensal</h3>
      </div>
      <div style={{ width: "100%", height: 320 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={dados} margin={{ top: 16, right: 8, bottom: 0, left: 8 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" vertical={false} />
            <XAxis
              dataKey="mes"
              stroke="var(--muted-foreground)"
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
              tickFormatter={(v: string) => v.slice(0, 3)}
            />
            <YAxis
              stroke="var(--muted-foreground)"
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
              tickFormatter={(v: number) =>
                v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
              }
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(76,78,84,0.06)" }} />
            <Legend
              wrapperStyle={{ fontSize: 11, color: "var(--muted-foreground)" }}
              iconSize={10}
            />
            <Bar
              name="Receitas"
              dataKey="receitas"
              fill="#16a34a"
              radius={[2, 2, 0, 0]}
              maxBarSize={28}
            />
            <Bar
              name="Despesas"
              dataKey="despesas"
              fill="#ef4444"
              radius={[2, 2, 0, 0]}
              maxBarSize={28}
            />
            <Line
              name="Resultado"
              type="monotone"
              dataKey="resultado"
              stroke="#C9953A"
              strokeWidth={2}
              dot={{ r: 3, fill: "#C9953A", stroke: "#0f0f12", strokeWidth: 1.5 }}
              activeDot={{ r: 4 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
