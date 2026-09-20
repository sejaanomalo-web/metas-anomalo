"use client"

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { formatBRL } from "@/lib/data"
import type { BaldeSerie } from "@/lib/financeiro-regras"

/**
 * Evolução de uma categoria ou conta na granularidade escolhida.
 *
 * Mostra sempre os baldes vazios: um mês sem despesa precisa aparecer como
 * zero. Se os meses sem movimento sumissem, o gráfico daria a impressão de
 * que os que sobraram são consecutivos — e a leitura de tendência sairia
 * errada.
 */
export default function GraficoEvolucao({
  serie,
  destacar,
  cor,
}: {
  serie: BaldeSerie[]
  destacar: "receitas" | "despesas"
  cor: string
}) {
  const vazio = serie.every((b) => b.receitas === 0 && b.despesas === 0)

  if (vazio) {
    return (
      <p style={{ fontSize: 13, color: "var(--muted-foreground)", padding: "24px 0" }}>
        Nada realizado nessa janela.
      </p>
    )
  }

  return (
    <div style={{ width: "100%", height: 260 }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={serie} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" vertical={false} />
          <XAxis
            dataKey="rotulo"
            stroke="var(--muted-foreground)"
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            interval="preserveStartEnd"
            minTickGap={12}
          />
          <YAxis
            stroke="var(--muted-foreground)"
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
          />
          <Tooltip
            cursor={{ fill: "rgba(76,78,84,0.06)" }}
            content={({ active, payload, label }) => {
              if (!active || !payload || payload.length === 0) return null
              return (
                <div
                  style={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    padding: "10px 14px",
                    fontSize: 12,
                  }}
                >
                  <p style={{ fontWeight: 600, marginBottom: 4 }}>{label}</p>
                  <p style={{ fontVariantNumeric: "tabular-nums" }}>
                    {formatBRL(Number(payload[0].value ?? 0))}
                  </p>
                </div>
              )
            }}
          />
          <Bar dataKey={destacar} fill={cor} radius={[2, 2, 0, 0]} maxBarSize={32} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
