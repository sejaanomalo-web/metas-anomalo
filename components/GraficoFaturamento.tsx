"use client"

import {
  CartesianGrid,
  Legend,
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
    <div className="glass" style={{ padding: 24 }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
        <p
          style={{
            fontSize: 9,
            letterSpacing: "2px",
            color: "rgba(255,255,255,0.35)",
            textTransform: "uppercase",
            fontWeight: 500,
          }}
        >
          Evolução do faturamento
        </p>
        {temReal && (
          <div className="flex items-center gap-4" style={{ fontSize: 11, fontWeight: 400 }}>
            <span style={{ color: "#C9953A" }}>── Meta</span>
            <span style={{ color: "#4caf50" }}>┅ Real</span>
          </div>
        )}
      </div>

      <div style={{ width: "100%", height: 300 }}>
        <ResponsiveContainer>
          <LineChart
            data={dados}
            margin={{ top: 10, right: 16, bottom: 4, left: 0 }}
          >
            <CartesianGrid
              stroke="rgba(255,255,255,0.04)"
              strokeDasharray="2 4"
              vertical={false}
            />
            <XAxis
              dataKey="mes"
              stroke="rgba(255,255,255,0.3)"
              tickLine={false}
              axisLine={false}
              style={{ fontSize: 9, fontFamily: "Poppins" }}
            />
            <YAxis
              stroke="rgba(255,255,255,0.3)"
              tickLine={false}
              axisLine={false}
              style={{ fontSize: 9, fontFamily: "Poppins" }}
              tickFormatter={(v) =>
                v >= 1000 ? `${Math.round(v / 1000)}k` : String(v)
              }
            />
            <Tooltip
              cursor={{ stroke: "rgba(201,149,58,0.25)" }}
              contentStyle={{
                background: "rgba(0,0,0,0.8)",
                border: "0.5px solid rgba(255,255,255,0.1)",
                borderRadius: 8,
                backdropFilter: "blur(16px)",
                color: "#fff",
                fontFamily: "Poppins",
                fontSize: 11,
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
            {temReal && (
              <Legend
                wrapperStyle={{
                  fontSize: 10,
                  color: "rgba(255,255,255,0.4)",
                  fontFamily: "Poppins",
                }}
                iconType="plainline"
              />
            )}
            <Line
              type="monotone"
              dataKey="meta"
              name="Meta"
              stroke="#C9953A"
              strokeWidth={1.5}
              dot={false}
              activeDot={{ r: 4, fill: "#C9953A", stroke: "#000" }}
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
                activeDot={{ r: 3, fill: "#4caf50", stroke: "#000" }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
