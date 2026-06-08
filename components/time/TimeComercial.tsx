"use client"

import { useState } from "react"
import { formatBRL, formatNumero } from "@/lib/data"
import type { ResumoComercial } from "@/lib/comercial-tipos"

export interface MembroComercial {
  id: string
  nome: string
  email: string
  resumo: ResumoComercial
}

/**
 * Time comercial — lista os usuários com papel comercial e mostra as
 * métricas INDIVIDUAIS de quem é selecionado (atribuição real por
 * colaborador_id em relatorios_comerciais).
 */
export default function TimeComercial({
  membros,
}: {
  membros: MembroComercial[]
}) {
  const [selId, setSelId] = useState(membros[0]?.id ?? "")
  const sel = membros.find((m) => m.id === selId) ?? membros[0] ?? null

  if (membros.length === 0) {
    return (
      <p style={{ fontSize: 13, color: "var(--text-4)", fontStyle: "italic" }}>
        Nenhum usuário com acesso comercial cadastrado.
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
                {formatNumero(m.resumo.contratos_fechados)} contratos ·{" "}
                {formatBRL(m.resumo.faturamento_gerado)}
              </p>
            </button>
          )
        })}
      </div>

      <div className="lg:col-span-2">{sel && <Detalhe membro={sel} />}</div>
    </div>
  )
}

function Detalhe({ membro }: { membro: MembroComercial }) {
  const r = membro.resumo
  const ticket =
    r.contratos_fechados > 0
      ? r.faturamento_gerado / r.contratos_fechados
      : null
  const convReuniao =
    r.mensagens > 0 ? r.reunioes_realizadas / r.mensagens : null
  const convContrato =
    r.reunioes_realizadas > 0
      ? r.contratos_fechados / r.reunioes_realizadas
      : null

  return (
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
        {membro.nome}
      </p>
      <p style={{ fontSize: 12, color: "var(--text-4)", marginTop: 2 }}>
        {membro.email} · {r.registros}{" "}
        {r.registros === 1 ? "dia reportado" : "dias reportados"}
      </p>

      {r.registros === 0 && (
        <p style={{ fontSize: 12, color: "var(--warning)", marginTop: 10 }}>
          Sem registros no período — o relatório comercial dessa pessoa ainda
          não foi preenchido.
        </p>
      )}

      <div
        className="grid grid-cols-2 sm:grid-cols-3"
        style={{ gap: 12, marginTop: 16 }}
      >
        <Kpi label="Mensagens enviadas" valor={formatNumero(r.mensagens)} />
        <Kpi label="Retorno" valor={formatNumero(r.retorno_mensagens)} />
        <Kpi label="Qualificados" valor={formatNumero(r.qualificados)} />
        <Kpi
          label="Reuniões agendadas"
          valor={formatNumero(r.reunioes_agendadas)}
        />
        <Kpi
          label="Reuniões realizadas"
          valor={formatNumero(r.reunioes_realizadas)}
        />
        <Kpi label="No-shows" valor={formatNumero(r.no_shows)} />
        <Kpi label="Propostas" valor={formatNumero(r.propostas_enviadas)} />
        <Kpi
          label="Contratos"
          valor={formatNumero(r.contratos_fechados)}
          destaque
        />
        <Kpi
          label="Faturamento"
          valor={formatBRL(r.faturamento_gerado)}
          destaque
        />
        <Kpi
          label="Ticket médio"
          valor={ticket != null ? formatBRL(ticket) : "·"}
        />
        <Kpi
          label="Conv. msg→reunião"
          valor={convReuniao != null ? `${(convReuniao * 100).toFixed(0)}%` : "·"}
        />
        <Kpi
          label="Conv. reunião→contrato"
          valor={
            convContrato != null ? `${(convContrato * 100).toFixed(0)}%` : "·"
          }
        />
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
