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
    <div className="card p-6">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs uppercase tracking-widest text-neutral-500">
          Evolução do faturamento
        </p>
        {temReal && (
          <span className="text-[10px] uppercase tracking-widest text-neutral-500">
            Meta vs Real
          </span>
        )}
      </div>
      <div style={{ width: "100%", height: 320 }}>
        <ResponsiveContainer>
          <LineChart
            data={dados}
            margin={{ top: 10, right: 16, bottom: 10, left: 0 }}
          >
            <defs>
              <linearGradient id="goldLine" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#C9953A" />
                <stop offset="100%" stopColor="#e6b560" />
              </linearGradient>
            </defs>
            <CartesianGrid
              stroke="#1a1a1a"
              strokeDasharray="3 3"
              vertical={false}
            />
            <XAxis
              dataKey="mes"
              stroke="#555"
              tickLine={false}
              axisLine={false}
              fontSize={11}
            />
            <YAxis
              stroke="#555"
              tickLine={false}
              axisLine={false}
              fontSize={11}
              tickFormatter={(v) =>
                v >= 1000 ? `${Math.round(v / 1000)}k` : String(v)
              }
            />
            <Tooltip
              cursor={{ stroke: "#C9953A33" }}
              contentStyle={{
                background: "#111",
                border: "1px solid #C9953A55",
                borderRadius: 8,
                color: "#fff",
                fontSize: 12,
              }}
              formatter={(v, name) => {
                const n = typeof v === "number" ? v : Number(v)
                const texto =
                  !Number.isFinite(n)
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
                wrapperStyle={{ fontSize: 11, color: "#999" }}
                iconType="plainline"
              />
            )}
            <Line
              type="monotone"
              dataKey="meta"
              name="Meta"
              stroke="url(#goldLine)"
              strokeWidth={2.5}
              dot={{ r: 4, stroke: "#C9953A", strokeWidth: 2, fill: "#0a0a0a" }}
              activeDot={{ r: 6, fill: "#C9953A" }}
            />
            {temReal && (
              <Line
                type="monotone"
                dataKey="real"
                name="Real"
                stroke="#ffffff"
                strokeWidth={2}
                strokeDasharray="4 3"
                dot={{ r: 3, stroke: "#fff", strokeWidth: 2, fill: "#0a0a0a" }}
                connectNulls={false}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
