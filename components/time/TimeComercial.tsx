"use client"

import { useState } from "react"
import { formatBRL, formatNumero } from "@/lib/data"
import FunilAtividadeComercial from "@/components/FunilAtividadeComercial"
import ClientesComercial from "@/components/comercial/ClientesComercial"
import type {
  ResumoComercial,
  ResumoComercialCliente,
} from "@/lib/comercial-tipos"

export interface MembroComercial {
  id: string
  nome: string
  email: string
  resumo: ResumoComercial
  porCliente: ResumoComercialCliente[]
}

/**
 * Time comercial — lista os usuários com papel comercial e, ao selecionar
 * uma pessoa, mostra o FUNIL dela (mesmo componente do funil principal, com
 * cores + % de cada etapa) e a quebra de quais clientes ela prospectou.
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
    <div className="grid grid-cols-1 lg:grid-cols-4" style={{ gap: 16 }}>
      <div>
        {/* Mobile: seletor de pessoa; a lista de botoes abaixo aparece so no desktop. */}
        <div className="lg:hidden" style={{ position: "relative" }}>
          <select
            aria-label="Pessoa do time"
            value={sel?.id ?? ""}
            onChange={(e) => setSelId(e.target.value)}
            style={{
              width: "100%",
              padding: "12px 38px 12px 14px",
              fontSize: 14,
              fontWeight: 600,
              color: "var(--text-1)",
              backgroundColor: "var(--card-bg)",
              border: "1px solid var(--card-border)",
              borderRadius: 12,
              appearance: "none",
              WebkitAppearance: "none",
              cursor: "pointer",
            }}
          >
            {membros.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome}
              </option>
            ))}
          </select>
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              right: 14,
              top: "50%",
              transform: "translateY(-50%)",
              pointerEvents: "none",
              fontSize: 11,
              color: "var(--text-4)",
            }}
          >
            ▼
          </span>
        </div>
        <div className="hidden lg:flex" style={{ flexDirection: "column", gap: 8 }}>
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
              <p style={{ fontSize: 14, fontWeight: 600, color: "var(--text-1)" }}>
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
      </div>

      <div className="lg:col-span-3">{sel && <Detalhe membro={sel} />}</div>
    </div>
  )
}

function Detalhe({ membro }: { membro: MembroComercial }) {
  const r = membro.resumo
  const ticket =
    r.contratos_fechados > 0 ? r.faturamento_gerado / r.contratos_fechados : null
  const convFinal = r.mensagens > 0 ? r.contratos_fechados / r.mensagens : null

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
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

        <div style={{ marginTop: 18 }}>
          <FunilAtividadeComercial resumo={r} />
        </div>

        <div
          style={{
            display: "flex",
            gap: 28,
            marginTop: 18,
            justifyContent: "center",
            flexWrap: "wrap",
          }}
        >
          <Mini label="Ticket médio" valor={ticket != null ? formatBRL(ticket) : "·"} />
          <Mini
            label="Conv. msg→contrato"
            valor={convFinal != null ? `${(convFinal * 100).toFixed(0)}%` : "·"}
          />
          <Mini label="No-shows" valor={formatNumero(r.no_shows)} />
        </div>
      </div>

      <div className="glass" style={{ padding: 24 }}>
        <ClientesComercial
          clientes={membro.porCliente}
          titulo="Clientes prospectados por essa pessoa"
          vazioMsg="Sem prospecções atribuídas a essa pessoa no período."
        />
      </div>
    </div>
  )
}

function Mini({ label, valor }: { label: string; valor: string }) {
  return (
    <div style={{ textAlign: "center" }}>
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
          fontSize: 20,
          fontWeight: 700,
          marginTop: 4,
          color: "var(--text-1)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {valor}
      </p>
    </div>
  )
}
