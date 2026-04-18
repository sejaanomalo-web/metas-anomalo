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
  meta: number
  real: number | null
}

interface LinhaDados {
  mes: string
  valor: number | null
}

interface SegmentoLinha {
  cor: string
  dados: LinhaDados[]
}

function construirSegmentos(dados: Ponto[]): SegmentoLinha[] {
  const segmentos: SegmentoLinha[] = []
  for (let i = 0; i < dados.length - 1; i++) {
    const a = dados[i]
    const b = dados[i + 1]
    if (a.real === null || b.real === null) continue
    const cor = a.real >= a.meta ? "#4caf50" : "#e24b4a"
    const serie: LinhaDados[] = dados.map((d, idx) => ({
      mes: d.mes,
      valor: idx === i ? a.real : idx === i + 1 ? b.real : null,
    }))
    segmentos.push({ cor, dados: serie })
  }
  return segmentos
}

function construirPontos(dados: Ponto[]): LinhaDados[] {
  return dados.map((d) => ({
    mes: d.mes,
    valor: d.real,
  }))
}

interface DadosTooltip {
  mes: string
  meta: number
  real: number | null
}

type TooltipPayloadItem = { payload?: unknown }

function TooltipConteudo({
  active,
  payload,
  pontos,
}: {
  active?: boolean
  payload?: TooltipPayloadItem[]
  pontos: DadosTooltip[]
}) {
  if (!active || !payload || payload.length === 0) return null
  const itemPayload = payload[0]?.payload as { mes?: unknown } | undefined
  const mesLabel = typeof itemPayload?.mes === "string" ? itemPayload.mes : ""
  const ponto = pontos.find((p) => p.mes === mesLabel)
  if (!ponto) return null
  const real = ponto.real
  const diff = real !== null ? real - ponto.meta : null
  const corStatus = real === null
    ? "rgba(255,255,255,0.5)"
    : real >= ponto.meta
    ? "#4caf50"
    : "#e24b4a"

  return (
    <div
      style={{
        background: "rgba(0,0,0,0.85)",
        border: "0.5px solid rgba(255,255,255,0.1)",
        borderRadius: 8,
        backdropFilter: "blur(16px)",
        padding: "10px 14px",
        fontFamily: "Poppins",
        fontSize: 11,
        fontWeight: 400,
        color: "#fff",
        boxShadow: "none",
      }}
    >
      <p
        style={{
          fontSize: 10,
          color: "rgba(255,255,255,0.5)",
          letterSpacing: "1px",
          textTransform: "uppercase",
          marginBottom: 6,
        }}
      >
        {mesLabel}
      </p>
      <p style={{ color: "#C9953A", marginBottom: 2 }}>
        Meta: {formatBRL(ponto.meta)}
      </p>
      {real !== null ? (
        <>
          <p style={{ color: corStatus, marginBottom: 2 }}>
            Real: {formatBRL(real)}
          </p>
          {diff !== null && (
            <p style={{ color: corStatus }}>
              Diferença: {diff >= 0 ? "+" : ""}
              {formatBRL(diff)}
            </p>
          )}
        </>
      ) : (
        <p style={{ color: "rgba(255,255,255,0.3)" }}>Real: não inserido</p>
      )}
    </div>
  )
}

export default function GraficoFaturamento({ dados }: { dados: Ponto[] }) {
  const temReal = dados.some((p) => p.real !== null && p.real > 0)
  const segmentos = construirSegmentos(dados)
  const pontos = construirPontos(dados)

  return (
    <div
      className="glass h-full flex flex-col"
      style={{ padding: 24 }}
    >
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
          Evolução do Faturamento
        </p>
        {!temReal && (
          <span
            style={{
              fontSize: 9,
              color: "rgba(255,255,255,0.2)",
              fontWeight: 300,
            }}
          >
            Sem dados reais inseridos
          </span>
        )}
      </div>

      <div style={{ width: "100%", flex: 1, minHeight: 280 }}>
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
              content={<TooltipConteudo pontos={dados} />}
            />
            <Line
              type="monotone"
              dataKey="meta"
              name="Meta"
              stroke="#C9953A"
              strokeWidth={1.5}
              dot={false}
              activeDot={{ r: 4, fill: "#C9953A", stroke: "#000" }}
            />
            {segmentos.map((seg, idx) => (
              <Line
                key={`seg-${idx}`}
                type="monotone"
                data={seg.dados}
                dataKey="valor"
                name="Real"
                stroke={seg.cor}
                strokeWidth={1.5}
                strokeDasharray="4 2"
                dot={false}
                connectNulls={false}
                activeDot={false}
                legendType="none"
                isAnimationActive={false}
              />
            ))}
            {temReal && (
              <Line
                type="monotone"
                data={pontos}
                dataKey="valor"
                name="Pontos"
                stroke="transparent"
                dot={(props) => {
                  const { cx, cy, payload, index } = props as {
                    cx?: number
                    cy?: number
                    payload?: { mes?: string; valor?: number | null }
                    index?: number
                  }
                  if (
                    typeof cx !== "number" ||
                    typeof cy !== "number" ||
                    !payload ||
                    typeof payload.valor !== "number"
                  ) {
                    return <g key={`dot-empty-${index ?? 0}`} />
                  }
                  const alvoMes = payload.mes
                  const pontoMeta = dados.find((d) => d.mes === alvoMes)
                  const metaDomes = pontoMeta?.meta ?? 0
                  const cor =
                    payload.valor >= metaDomes ? "#4caf50" : "#e24b4a"
                  return (
                    <circle
                      key={`dot-${alvoMes ?? index ?? 0}`}
                      cx={cx}
                      cy={cy}
                      r={4}
                      fill={cor}
                      stroke="#000"
                      strokeWidth={0.5}
                    />
                  )
                }}
                activeDot={false}
                legendType="none"
                isAnimationActive={false}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div
        className="flex items-center gap-5 flex-wrap"
        style={{
          marginTop: 12,
          paddingTop: 12,
          borderTop: "0.5px solid rgba(255,255,255,0.05)",
          fontSize: 10,
          fontWeight: 400,
          color: "rgba(255,255,255,0.4)",
        }}
      >
        <span style={{ color: "#C9953A" }}>── Meta</span>
        {temReal && (
          <>
            <span style={{ color: "#4caf50" }}>┅ Real acima da meta</span>
            <span style={{ color: "#e24b4a" }}>┅ Real abaixo da meta</span>
          </>
        )}
      </div>
    </div>
  )
}
