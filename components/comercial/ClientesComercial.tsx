"use client"

import { useState } from "react"
import FunilAtividadeComercial from "@/components/FunilAtividadeComercial"
import type { ResumoComercialCliente } from "@/lib/comercial-tipos"

/**
 * "Por cliente" — de quais clientes foram as prospecções. Lista os clientes
 * do período com mini-stats do funil; cada linha EXPANDE para o funil
 * completo daquele cliente (reusa FunilAtividadeComercial). Geral (todo o
 * time) ou filtrado por uma pessoa.
 */
export default function ClientesComercial({
  clientes,
  titulo = "Por cliente",
  vazioMsg = "Sem prospecções no período.",
}: {
  clientes: ResumoComercialCliente[]
  titulo?: string
  vazioMsg?: string
}) {
  return (
    <div>
      {titulo && (
        <p
          style={{
            fontSize: 11,
            letterSpacing: "1.5px",
            color: "var(--text-3)",
            textTransform: "uppercase",
            fontWeight: 500,
            marginBottom: 14,
          }}
        >
          {titulo}
        </p>
      )}
      {clientes.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--text-4)", fontStyle: "italic" }}>
          {vazioMsg}
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {clientes.map((c) => (
            <LinhaCliente key={c.empresa} cliente={c} />
          ))}
        </div>
      )}
    </div>
  )
}

function LinhaCliente({ cliente }: { cliente: ResumoComercialCliente }) {
  const [aberto, setAberto] = useState(false)
  const r = cliente.resumo
  const convFinal =
    r.mensagens > 0 ? Math.round((r.contratos_fechados / r.mensagens) * 100) : null

  return (
    <div className="glass" style={{ overflow: "hidden" }}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        style={{
          width: "100%",
          textAlign: "left",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          padding: "14px 18px",
          display: "flex",
          alignItems: "center",
          gap: 14,
          color: "inherit",
        }}
      >
        <span
          style={{
            fontSize: 15,
            fontWeight: 700,
            color: "var(--text-1)",
            flex: "0 0 auto",
            maxWidth: 220,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={cliente.empresa}
        >
          {cliente.empresa}
        </span>
        <span
          style={{
            flexShrink: 0,
            fontSize: 11,
            color: "var(--text-4)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {convFinal === null ? "" : `${convFinal}% msg→contrato`}
        </span>
        <span
          aria-hidden="true"
          style={{ marginLeft: "auto", flexShrink: 0, fontSize: 12, color: "var(--text-4)" }}
        >
          {aberto ? "▲" : "▼"}
        </span>
      </button>

      {aberto && (
        <div style={{ padding: "4px 18px 20px" }}>
          <div style={{ height: 1, background: "rgba(255,255,255,0.06)", marginBottom: 16 }} />
          <FunilAtividadeComercial resumo={r} />
        </div>
      )}
    </div>
  )
}
