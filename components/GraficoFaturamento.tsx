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

interface Ponto {
  mes: string
  meta: number
  real: number | null
}

export default function GraficoFaturamento({ dados }: { dados: Ponto[] }) {
  const temReal = dados.some((p) => p.real !== null && p.real > 0)

  return (
    <div
      style={{
        background: "#090909",
        border: "0.5px solid #141414",
        borderRadius: 10,
        padding: 24,
      }}
    >
      <div
        className="flex items-center justify-between"
        style={{ marginBottom: 16 }}
      >
        <p
          style={{
            fontSize: 11,
            letterSpacing: "1px",
            color: "#666",
            textTransform: "uppercase",
            fontWeight: 400,
          }}
        >
          Evolução do faturamento
        </p>
        {temReal && (
          <div
            className="flex items-center gap-4"
            style={{ fontSize: 11, fontWeight: 400 }}
          >
            <span style={{ color: "#C9953A" }}>── Meta</span>
            <span style={{ color: "#4caf50" }}>┅ Real</span>
          </div>
        )}
      </div>

      <div style={{ width: "100%", height: 280 }}>
        <ResponsiveContainer>
          <LineChart
            data={dados}
            margin={{ top: 8, right: 10, bottom: 4, left: 0 }}
          >
            <CartesianGrid
              stroke="#141414"
              strokeDasharray="2 4"
              vertical={false}
            />
            <XAxis
              dataKey="mes"
              stroke="#444"
              tickLine={false}
              axisLine={false}
              style={{ fontSize: 11 }}
            />
            <YAxis
              stroke="#444"
              tickLine={false}
              axisLine={false}
              style={{ fontSize: 11 }}
              tickFormatter={(v) =>
                v >= 1000 ? `${Math.round(v / 1000)}k` : String(v)
              }
            />
            <Tooltip
              cursor={{ stroke: "#C9953A33" }}
              contentStyle={{
                background: "#0c0c0c",
                border: "0.5px solid #1e1e1e",
                borderRadius: 4,
                color: "#e0e0e0",
                fontSize: 12,
                fontWeight: 400,
                boxShadow: "none",
              }}
              formatter={(v, name) => {
                const n = typeof v === "number" ? v : Number(v)
                const texto = !Number.isFinite(n)
                  ? "—"
                  : n.toLocaleString("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                      maximumFractionDigits: 0,
                    })
                return [texto, name]
              }}
            />
            <Line
              type="monotone"
              dataKey="meta"
              name="Meta"
              stroke="#C9953A"
              strokeWidth={1.5}
              dot={false}
              activeDot={{ r: 4, fill: "#C9953A", stroke: "#0c0c0c" }}
            />
            {temReal && (
              <Line
                type="monotone"
                dataKey="real"
                name="Real"
                stroke="#4caf50"
                strokeWidth={1.5}
                strokeDasharray="4 2"
                dot={false}
                connectNulls={false}
                activeDot={{ r: 3, fill: "#4caf50", stroke: "#0c0c0c" }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
