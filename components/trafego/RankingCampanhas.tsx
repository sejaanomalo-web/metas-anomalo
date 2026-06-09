"use client"

import { useState } from "react"
import Link from "next/link"
import { formatBRL, formatNumero } from "@/lib/data"
import { COR } from "@/lib/design-tokens"
import type { CampanhaRanking, OrdenacaoRanking } from "@/lib/anuncios"

/**
 * Bloco "RANKING DE CAMPANHAS" — vai DENTRO do PainelTrafego, acima dos
 * Alertas. Top-5 campanhas do período, ordenáveis client-side (sem refetch),
 * com barra ∝ aos resultados. "Ver todas" abre o Gerenciador de Anúncios.
 *
 * "N resultados" = conversão principal de cada campanha pelo objetivo/categoria
 * (leads/conversas/compras). São unidades nominais diferentes entre objetivos —
 * a barra compara quantidades, não valor (comportamento Meta-like).
 */

const ORDENS: { v: OrdenacaoRanking; label: string }[] = [
  { v: "resultados", label: "Mais resultados" },
  { v: "gasto", label: "Maior gasto" },
  { v: "alcance", label: "Maior alcance" },
  { v: "cliques", label: "Mais cliques" },
]

export default function RankingCampanhas({
  campanhas,
  empresaSlug,
  mes,
  ano,
}: {
  campanhas: CampanhaRanking[]
  empresaSlug: string
  mes: string
  ano: number
}) {
  const [ordem, setOrdem] = useState<OrdenacaoRanking>("resultados")
  if (campanhas.length === 0) return null

  const ordenadas = [...campanhas].sort((a, b) => metrica(b, ordem) - metrica(a, ordem))
  const top = ordenadas.slice(0, 5)
  const maxResultados = Math.max(...top.map((c) => c.resultados), 1)

  return (
    <section className="glass" style={{ padding: 24 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          marginBottom: 18,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span aria-hidden="true" style={{ fontSize: 18 }}>
            🏆
          </span>
          <h2
            style={{
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--text-2)",
            }}
          >
            Ranking de campanhas
          </h2>
        </div>
        <select
          value={ordem}
          onChange={(e) => setOrdem(e.target.value as OrdenacaoRanking)}
          className="glass-input"
          style={{ fontSize: 12, padding: "8px 12px", borderRadius: 10 }}
          aria-label="Ordenar ranking"
        >
          {ORDENS.map((o) => (
            <option key={o.v} value={o.v}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {top.map((c, i) => (
          <LinhaRanking
            key={c.campanhaId}
            c={c}
            pos={i + 1}
            maxResultados={maxResultados}
          />
        ))}
      </div>

      <div style={{ marginTop: 16, textAlign: "right" }}>
        <Link
          href={`/dashboard/${empresaSlug}/anuncios?mes=${mes}&ano=${ano}`}
          className="no-ds hover:brightness-110"
          style={{ fontSize: 12, fontWeight: 600, color: "var(--accent)" }}
        >
          Ver todas →
        </Link>
      </div>
    </section>
  )
}

function metrica(c: CampanhaRanking, ordem: OrdenacaoRanking): number {
  if (ordem === "gasto") return c.investimento
  if (ordem === "alcance") return c.alcance
  if (ordem === "cliques") return c.cliques
  return c.resultados
}

function LinhaRanking({
  c,
  pos,
  maxResultados,
}: {
  c: CampanhaRanking
  pos: number
  maxResultados: number
}) {
  const top1 = pos === 1
  const pct = Math.max((c.resultados / maxResultados) * 100, 2)
  return (
    <div
      style={{
        padding: top1 ? "16px 18px" : "12px 6px",
        borderRadius: 12,
        border: top1 ? "1px solid rgba(201,149,58,0.55)" : "none",
        background: top1 ? "rgba(201,149,58,0.06)" : "transparent",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span
          style={{
            width: 26,
            height: 26,
            borderRadius: "50%",
            flexShrink: 0,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            fontWeight: 700,
            background: top1 ? COR.accent : "var(--surface-2)",
            color: top1 ? "#000" : "var(--text-3)",
          }}
        >
          {pos}
        </span>
        <span
          style={{
            fontSize: 15,
            fontWeight: 600,
            color: top1 ? COR.accent : "var(--text-1)",
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={c.nome}
        >
          {c.nome}
        </span>
        <span
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: top1 ? COR.accent : "var(--text-1)",
            fontVariantNumeric: "tabular-nums",
            whiteSpace: "nowrap",
          }}
        >
          {formatNumero(c.resultados)} resultados
        </span>
      </div>

      <div
        style={{
          height: 6,
          borderRadius: 3,
          background: "rgba(255,255,255,0.06)",
          margin: "10px 0",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            borderRadius: 3,
            background: top1 ? COR.accent : COR.leads,
          }}
        />
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "4px 16px",
          fontSize: 12,
          color: "var(--text-3)",
        }}
      >
        <Metr label="Gasto" valor={formatBRL(c.investimento)} />
        <Metr label="Alcance" valor={formatNumero(c.alcance)} />
        <Metr label="Cliques" valor={formatNumero(c.cliques)} />
        <Metr label="Conversas" valor={formatNumero(c.conversas)} cor={COR.conversas} />
        <Metr label="Leads" valor={formatNumero(c.leads)} cor={COR.leads} />
        <Metr
          label="Compras"
          valor={c.compras != null ? formatNumero(c.compras) : "—"}
          cor={COR.compras}
        />
      </div>
    </div>
  )
}

function Metr({
  label,
  valor,
  cor,
}: {
  label: string
  valor: string
  cor?: string
}) {
  return (
    <span>
      {label}:{" "}
      <strong style={{ color: cor ?? "var(--text-1)", fontWeight: 700 }}>
        {valor}
      </strong>
    </span>
  )
}
