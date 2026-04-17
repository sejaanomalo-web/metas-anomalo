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
  faturamento: number
}

export default function GraficoFaturamento({ dados }: { dados: Ponto[] }) {
  return (
    <div className="card p-6">
      <p className="text-xs uppercase tracking-widest text-neutral-500 mb-4">
        Evolução do faturamento
      </p>
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
              formatter={(v: number) =>
                v.toLocaleString("pt-BR", {
                  style: "currency",
                  currency: "BRL",
                  maximumFractionDigits: 0,
                })
              }
            />
            <Line
              type="monotone"
              dataKey="faturamento"
              stroke="url(#goldLine)"
              strokeWidth={2.5}
              dot={{ r: 4, stroke: "#C9953A", strokeWidth: 2, fill: "#0a0a0a" }}
              activeDot={{ r: 6, fill: "#C9953A" }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
