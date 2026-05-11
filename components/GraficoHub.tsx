"use client"

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { formatBRL } from "@/lib/data"

interface Ponto {
  mes: string
  real: number | null
}

type TooltipPayloadItem = { payload?: unknown }

function TooltipConteudo({
  active,
  payload,
}: {
  active?: boolean
  payload?: TooltipPayloadItem[]
}) {
  if (!active || !payload || payload.length === 0) return null
  const item = payload[0]?.payload as { mes?: unknown; real?: unknown } | undefined
  const mesLabel = typeof item?.mes === "string" ? item.mes : ""
  const real = typeof item?.real === "number" ? item.real : null
  return (
    <div
      style={{
        background: "var(--surface-2)",
        border: "1px solid rgba(255,255,255,0.10)",
        borderRadius: 10,
        padding: "10px 14px",
        fontFamily: "Inter",
        fontSize: 12,
        fontWeight: 500,
        color: "var(--text-1)",
      }}
    >
      <p
        style={{
          fontSize: 11,
          color: "var(--text-3)",
          marginBottom: 4,
          fontWeight: 500,
        }}
      >
        {mesLabel}
      </p>
      <p style={{ color: "var(--accent)", fontWeight: 600 }}>
        {real !== null ? formatBRL(real) : "Sem dados"}
      </p>
    </div>
  )
}

function formatarTickY(v: number): string {
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `R$ ${Math.round(v / 1_000)}k`
  return `R$ ${v}`
}

/**
 * Gráfico de linha do faturamento mensal do Hub. Linha única em ouro
 * (#C9953A), sem comparar contra meta (a referência mostra só a evolução
 * do real). Y axis em BRL compacto, sem grid X, grid Y bem sutil.
 *
 * Renderizado dentro de um card (.glass) provido pelo caller — esse
 * componente cuida só do conteúdo (header + chart).
 */
export default function GraficoHub({
  dados,
  ano,
}: {
  dados: Ponto[]
  ano: number
}) {
  const temReal = dados.some((p) => p.real !== null && p.real > 0)

  return (
    <div
      className="glass"
      style={{
        padding: 24,
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 460,
      }}
    >
      <div
        className="flex items-center justify-between"
        style={{ marginBottom: 16 }}
      >
        <div>
          <p
            style={{
              fontSize: 16,
              fontWeight: 600,
              color: "var(--text-1)",
              letterSpacing: "-0.01em",
            }}
          >
            Faturamento mensal
          </p>
          <p
            style={{
              fontSize: 12,
              color: "var(--text-3)",
              marginTop: 4,
            }}
          >
            Soma de todas as empresas · {ano}
          </p>
        </div>
        {!temReal && (
          <span
            style={{
              fontSize: 11,
              color: "var(--text-4)",
              fontStyle: "italic",
            }}
          >
            Sem dados reais inseridos
          </span>
        )}
      </div>

      <div
        style={{
          width: "100%",
          flex: 1,
          minHeight: 380,
        }}
      >
        <ResponsiveContainer>
          <LineChart
            data={dados}
            margin={{ top: 10, right: 16, bottom: 4, left: 8 }}
          >
            <CartesianGrid
              stroke="rgba(255,255,255,0.04)"
              strokeDasharray="2 4"
              vertical={false}
            />
            <XAxis
              dataKey="mes"
              stroke="var(--text-3)"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fontFamily: "Inter", fill: "var(--text-3)" }}
              tickFormatter={(v) => (typeof v === "string" ? v.slice(0, 3) : v)}
            />
            <YAxis
              stroke="var(--text-3)"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fontFamily: "Inter", fill: "var(--text-3)" }}
              tickFormatter={formatarTickY}
              width={70}
              domain={[0, 1_000_000]}
              ticks={[0, 250_000, 500_000, 750_000, 1_000_000]}
              allowDataOverflow={false}
            />
            <Tooltip
              cursor={{ stroke: "rgba(201,149,58,0.25)", strokeWidth: 1 }}
              content={<TooltipConteudo />}
            />
            <Line
              type="monotone"
              dataKey="real"
              name="Faturamento"
              stroke="#C9953A"
              strokeWidth={2}
              dot={{
                r: 4,
                fill: "#C9953A",
                stroke: "var(--surface-1)",
                strokeWidth: 2,
              }}
              activeDot={{ r: 6, fill: "#C9953A", stroke: "var(--surface-1)", strokeWidth: 2 }}
              connectNulls={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
