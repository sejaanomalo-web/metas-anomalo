"use client"

import { useState } from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { formatBRL } from "@/lib/data"
import type { ComparativoContas } from "@/lib/financeiro"

/**
 * Comparativo mês a mês das contas: duas barras por conta — receitas na cor
 * cheia, despesas na mesma cor mais clara.
 *
 * Usar a MESMA cor para receita e despesa de uma conta (variando só a
 * opacidade) é o que permite ler o gráfico por conta. Cores diferentes por
 * tipo fariam duas contas com movimento parecido virarem um borrão.
 */
export default function GraficoComparativoContas({
  dados,
  ano,
}: {
  dados: ComparativoContas
  ano: number
}) {
  const [ocultas, setOcultas] = useState<Set<string>>(new Set())

  const visiveis = dados.contas.filter((c) => !ocultas.has(c.id))

  const serie = dados.meses.map((m) => {
    const linha: Record<string, string | number> = { rotulo: m.rotulo }
    for (const conta of dados.contas) {
      const v = m.valores[conta.id] ?? { receitas: 0, despesas: 0 }
      linha[`r_${conta.id}`] = v.receitas
      linha[`d_${conta.id}`] = v.despesas
    }
    return linha
  })

  const temMovimento = serie.some((m) =>
    dados.contas.some(
      (c) => Number(m[`r_${c.id}`]) > 0 || Number(m[`d_${c.id}`]) > 0
    )
  )

  function alternar(id: string) {
    setOcultas((atual) => {
      const novo = new Set(atual)
      if (novo.has(id)) novo.delete(id)
      else novo.add(id)
      return novo
    })
  }

  if (dados.contas.length === 0) return null

  return (
    <div
      className="glass"
      style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}
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
          Comparativo por conta · {ano}
        </p>
        <h3 style={{ fontSize: 18, marginTop: 4 }}>Quanto entrou e saiu de cada conta</h3>
        <p style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 4 }}>
          Só lançamentos realizados, no mês da competência. Cor cheia = entrou,
          clara = saiu.
        </p>
      </div>

      {!temMovimento ? (
        <p style={{ fontSize: 13, color: "var(--muted-foreground)", padding: "24px 0" }}>
          Nenhuma movimentação realizada em {ano}.
        </p>
      ) : (
        <>
          <div style={{ width: "100%", height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={serie} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" vertical={false} />
                <XAxis
                  dataKey="rotulo"
                  stroke="var(--muted-foreground)"
                  tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: "var(--border)" }}
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
                <Tooltip
                  cursor={{ fill: "rgba(76,78,84,0.06)" }}
                  content={({ active, payload, label }) => {
                    if (!active || !payload || payload.length === 0) return null
                    const comValor = payload.filter((p) => Number(p.value) > 0)
                    if (comValor.length === 0) return null
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
                        <p style={{ fontWeight: 600, marginBottom: 6 }}>{label}</p>
                        {comValor.map((p) => (
                          <p
                            key={String(p.dataKey)}
                            style={{ color: p.color, fontVariantNumeric: "tabular-nums" }}
                          >
                            {p.name}: {formatBRL(Number(p.value))}
                          </p>
                        ))}
                      </div>
                    )
                  }}
                />
                {visiveis.map((conta) => (
                  <Bar
                    key={`r_${conta.id}`}
                    name={`${conta.nome} · entrou`}
                    dataKey={`r_${conta.id}`}
                    fill={conta.cor}
                    radius={[2, 2, 0, 0]}
                    maxBarSize={18}
                  />
                ))}
                {visiveis.map((conta) => (
                  <Bar
                    key={`d_${conta.id}`}
                    name={`${conta.nome} · saiu`}
                    dataKey={`d_${conta.id}`}
                    fill={conta.cor}
                    fillOpacity={0.42}
                    radius={[2, 2, 0, 0]}
                    maxBarSize={18}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {dados.contas.map((conta) => {
              const oculta = ocultas.has(conta.id)
              return (
                <button
                  key={conta.id}
                  type="button"
                  onClick={() => alternar(conta.id)}
                  title={oculta ? "Mostrar no gráfico" : "Ocultar do gráfico"}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 7,
                    padding: "5px 11px",
                    borderRadius: 9999,
                    border: "0.5px solid rgba(255,255,255,0.12)",
                    background: "transparent",
                    cursor: "pointer",
                    fontSize: 12,
                    color: "var(--text-2)",
                    opacity: oculta ? 0.4 : 1,
                  }}
                >
                  <span
                    style={{
                      width: 9,
                      height: 9,
                      borderRadius: 2,
                      background: conta.cor,
                    }}
                  />
                  {conta.nome}
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
