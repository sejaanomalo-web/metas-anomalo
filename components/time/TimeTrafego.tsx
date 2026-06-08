"use client"

import { useState } from "react"
import { formatBRL, formatNumero } from "@/lib/data"
import type { ResumoTrafegoOperacao } from "@/lib/time"

interface Membro {
  id: string
  nome: string
  email: string
}

/**
 * Time de tráfego — lista os gestores de tráfego. O tráfego pago é 100%
 * automatizado (Sentinela) e não tem atribuição por pessoa, então as
 * métricas exibidas são as da OPERAÇÃO inteira do período (decisão de
 * produto), iguais para todos os gestores.
 */
export default function TimeTrafego({
  membros,
  operacao,
}: {
  membros: Membro[]
  operacao: ResumoTrafegoOperacao
}) {
  const [selId, setSelId] = useState(membros[0]?.id ?? "")
  const sel = membros.find((m) => m.id === selId) ?? membros[0] ?? null

  if (membros.length === 0) {
    return (
      <p style={{ fontSize: 13, color: "var(--text-4)", fontStyle: "italic" }}>
        Nenhum usuário com acesso de gestor de tráfego cadastrado.
      </p>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3" style={{ gap: 16 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {membros.map((m) => {
          const ativo = m.id === sel?.id
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => setSelId(m.id)}
              className="glass no-ds"
              style={{
                padding: "14px 16px",
                textAlign: "left",
                cursor: "pointer",
                borderColor: ativo ? "rgba(201,149,58,0.5)" : undefined,
                background: ativo ? "rgba(201,149,58,0.08)" : undefined,
              }}
            >
              <p
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: "var(--text-1)",
                }}
              >
                {m.nome}
              </p>
              <p style={{ fontSize: 11, color: "var(--text-4)", marginTop: 2 }}>
                {m.email}
              </p>
            </button>
          )
        })}
      </div>

      <div className="lg:col-span-2">
        {sel && (
          <div className="glass" style={{ padding: 24 }}>
            <p
              style={{
                fontSize: 11,
                letterSpacing: "1.5px",
                color: "var(--text-3)",
                textTransform: "uppercase",
                fontWeight: 500,
              }}
            >
              {sel.nome}
            </p>
            <p
              style={{
                fontSize: 12,
                color: "var(--text-4)",
                marginTop: 6,
                lineHeight: 1.5,
              }}
            >
              O tráfego pago é coletado automaticamente pelo Sentinela e não tem
              atribuição por pessoa — estas são as métricas da{" "}
              <strong style={{ color: "var(--text-2)" }}>
                operação inteira
              </strong>{" "}
              no período.
            </p>
            <div
              className="grid grid-cols-2 sm:grid-cols-3"
              style={{ gap: 12, marginTop: 16 }}
            >
              <Kpi
                label="Investimento"
                valor={formatBRL(operacao.investimento)}
                destaque
              />
              <Kpi label="Leads" valor={formatNumero(operacao.leads)} />
              <Kpi
                label="CPL médio"
                valor={operacao.cpl > 0 ? formatBRL(operacao.cpl) : "·"}
              />
              <Kpi
                label="Empresas c/ movimento"
                valor={formatNumero(operacao.empresas)}
              />
              <Kpi label="Reuniões" valor={formatNumero(operacao.reunioes)} />
              <Kpi label="Contratos" valor={formatNumero(operacao.contratos)} />
              <Kpi
                label="Faturamento"
                valor={formatBRL(operacao.faturamento)}
                destaque
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Kpi({
  label,
  valor,
  destaque,
}: {
  label: string
  valor: string
  destaque?: boolean
}) {
  return (
    <div
      className="glass"
      style={{
        padding: "14px 16px",
        borderColor: destaque ? "rgba(201,149,58,0.35)" : undefined,
      }}
    >
      <p
        style={{
          fontSize: 10,
          letterSpacing: "0.8px",
          textTransform: "uppercase",
          color: "var(--accent)",
          fontWeight: 600,
        }}
      >
        {label}
      </p>
      <p
        style={{
          fontSize: 22,
          fontWeight: 700,
          marginTop: 6,
          color: "var(--text-1)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {valor}
      </p>
    </div>
  )
}
