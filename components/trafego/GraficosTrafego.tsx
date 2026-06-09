"use client"

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { formatBRL, formatNumero } from "@/lib/data"
import type { SerieMesTrafego } from "@/lib/sentinela"

const COR_VERBA = "#4062f0"
const COR_CONVERSAS = "#a855f7"
const COR_FATURAMENTO = "#34c759"
const COR_AGENDAMENTOS = "#a855f7"

/**
 * Dois gráficos do painel de tráfego (modelo aprovado, image 1):
 *   • Evolução Mensal — linha: verba investida, conversas iniciadas,
 *     faturamento (últimos meses da série).
 *   • Comparativo Mensal — barras: agendamentos e faturamento por mês.
 * Recebe a série mensal pronta (serieMensalDeLinhas). Empresa e cliente.
 */
export default function GraficosTrafego({
  serie,
}: {
  serie: SerieMesTrafego[]
}) {
  // Últimos 6 meses (a série já vem ordenada asc).
  const dados = serie.slice(-6)
  const vazio = dados.length === 0

  return (
    <section className="grid grid-cols-1 lg:grid-cols-2" style={{ gap: 16 }}>
      <Card titulo="Evolução Mensal" sub="Investimento, conversas iniciadas e faturamento">
        {vazio ? (
          <Vazio />
        ) : (
          <div style={{ width: "100%", height: 260 }}>
            <ResponsiveContainer>
              <LineChart data={dados} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" strokeDasharray="2 4" vertical={false} />
                <XAxis dataKey="mes" stroke="rgba(255,255,255,0.3)" tickLine={false} axisLine={false} style={{ fontSize: 10 }} />
                <YAxis stroke="rgba(255,255,255,0.3)" tickLine={false} axisLine={false} style={{ fontSize: 10 }} tickFormatter={fmtK} />
                <Tooltip content={<TooltipLinha />} cursor={{ stroke: "rgba(201,149,58,0.25)" }} />
                <Line type="monotone" dataKey="investimento" name="Verba investida" stroke={COR_VERBA} strokeWidth={1.8} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="conversas" name="Conversas iniciadas" stroke={COR_CONVERSAS} strokeWidth={1.8} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="faturamento" name="Faturamento" stroke={COR_FATURAMENTO} strokeWidth={1.8} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        <Legenda
          itens={[
            { cor: COR_VERBA, label: "Verba investida" },
            { cor: COR_CONVERSAS, label: "Conversas iniciadas" },
            { cor: COR_FATURAMENTO, label: "Faturamento" },
          ]}
        />
      </Card>

      <Card titulo="Comparativo Mensal" sub="Realizados e faturamento por mês">
        {vazio ? (
          <Vazio />
        ) : (
          <div style={{ width: "100%", height: 260 }}>
            <ResponsiveContainer>
              <BarChart data={dados} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" strokeDasharray="2 4" vertical={false} />
                <XAxis dataKey="mes" stroke="rgba(255,255,255,0.3)" tickLine={false} axisLine={false} style={{ fontSize: 10 }} />
                <YAxis stroke="rgba(255,255,255,0.3)" tickLine={false} axisLine={false} style={{ fontSize: 10 }} tickFormatter={fmtK} />
                <Tooltip content={<TooltipBarra />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                <Bar dataKey="agendamentos" name="Realizados" fill={COR_AGENDAMENTOS} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                <Bar dataKey="faturamento" name="Faturamento" fill={COR_FATURAMENTO} radius={[3, 3, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        <Legenda
          itens={[
            { cor: COR_AGENDAMENTOS, label: "Realizados" },
            { cor: COR_FATURAMENTO, label: "Faturamento" },
          ]}
        />
      </Card>
    </section>
  )
}

function fmtK(v: number): string {
  return v >= 1000 ? `${Math.round(v / 1000)}k` : String(v)
}

function Card({
  titulo,
  sub,
  children,
}: {
  titulo: string
  sub: string
  children: React.ReactNode
}) {
  return (
    <div className="glass" style={{ padding: 24 }}>
      <p style={{ fontSize: 16, fontWeight: 600 }}>{titulo}</p>
      <p style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2, marginBottom: 14 }}>
        {sub}
      </p>
      {children}
    </div>
  )
}

function Vazio() {
  return (
    <div
      style={{
        height: 260,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--text-4)",
        fontSize: 13,
        fontStyle: "italic",
      }}
    >
      Sem dados no período.
    </div>
  )
}

function Legenda({ itens }: { itens: { cor: string; label: string }[] }) {
  return (
    <div
      className="flex items-center gap-5 flex-wrap"
      style={{ marginTop: 12, paddingTop: 12, borderTop: "0.5px solid rgba(255,255,255,0.05)", fontSize: 11 }}
    >
      {itens.map((i) => (
        <span key={i.label} style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--text-3)" }}>
          <span style={{ width: 9, height: 9, borderRadius: 3, background: i.cor }} />
          {i.label}
        </span>
      ))}
    </div>
  )
}

type TP = { active?: boolean; payload?: { payload?: SerieMesTrafego }[] }

function TooltipLinha({ active, payload }: TP) {
  const p = active && payload?.[0]?.payload
  if (!p) return null
  return (
    <CaixaTooltip mes={p.mes}>
      <Linha cor={COR_VERBA} label="Verba" valor={formatBRL(p.investimento)} />
      <Linha cor={COR_CONVERSAS} label="Conversas" valor={formatNumero(p.conversas)} />
      <Linha cor={COR_FATURAMENTO} label="Faturamento" valor={formatBRL(p.faturamento)} />
    </CaixaTooltip>
  )
}

function TooltipBarra({ active, payload }: TP) {
  const p = active && payload?.[0]?.payload
  if (!p) return null
  return (
    <CaixaTooltip mes={p.mes}>
      <Linha cor={COR_AGENDAMENTOS} label="Realizados" valor={formatNumero(p.agendamentos)} />
      <Linha cor={COR_FATURAMENTO} label="Faturamento" valor={formatBRL(p.faturamento)} />
    </CaixaTooltip>
  )
}

function CaixaTooltip({ mes, children }: { mes: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "rgba(0,0,0,0.85)",
        border: "0.5px solid rgba(255,255,255,0.1)",
        borderRadius: 8,
        backdropFilter: "blur(16px)",
        padding: "10px 14px",
        fontSize: 11,
        color: "#fff",
      }}
    >
      <p style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 6 }}>
        {mes}
      </p>
      {children}
    </div>
  )
}

function Linha({ cor, label, valor }: { cor: string; label: string; valor: string }) {
  return (
    <p style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
      <span style={{ width: 8, height: 8, borderRadius: 2, background: cor }} />
      <span style={{ color: "rgba(255,255,255,0.6)" }}>{label}:</span> {valor}
    </p>
  )
}
