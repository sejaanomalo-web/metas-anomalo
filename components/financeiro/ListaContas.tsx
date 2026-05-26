"use client"

import { useState } from "react"
import ContaDrawer from "./ContaDrawer"
import type { ContaFinanceira } from "@/lib/financeiro"
import { tipoContaRotulo } from "@/lib/financeiro"
import { formatBRL } from "@/lib/data"

export default function ListaContas({
  contas,
  saldos,
}: {
  contas: ContaFinanceira[]
  saldos: Map<string, number>
}) {
  const [drawerAberto, setDrawerAberto] = useState(false)
  const [editando, setEditando] = useState<ContaFinanceira | null>(null)

  function abrirNova() { setEditando(null); setDrawerAberto(true) }
  function editar(c: ContaFinanceira) { setEditando(c); setDrawerAberto(true) }

  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
        <button type="button" onClick={abrirNova} className="btn-gold-filled">
          + Nova conta
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3" style={{ gap: 16 }}>
        {contas.map((c) => {
          const saldoAtual = saldos.get(c.id) ?? Number(c.saldo_inicial)
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => editar(c)}
              className="glass"
              style={{
                padding: "20px 24px",
                textAlign: "left",
                display: "flex",
                flexDirection: "column",
                gap: 8,
                cursor: "pointer",
                opacity: c.ativa ? 1 : 0.6,
                border: "1px solid var(--border)",
              }}
            >
              <p
                style={{
                  fontSize: 11,
                  color: "var(--muted-foreground)",
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                }}
              >
                {tipoContaRotulo(c.tipo)}
                {!c.ativa && " · inativa"}
              </p>
              <p style={{ fontSize: 18, fontWeight: 600 }}>{c.nome}</p>
              <p
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  fontVariantNumeric: "tabular-nums",
                  color: saldoAtual >= 0 ? "var(--foreground)" : "var(--destructive)",
                  marginTop: 8,
                }}
              >
                {formatBRL(saldoAtual)}
              </p>
              <p style={{ fontSize: 11, color: "var(--muted-foreground)" }}>
                Saldo inicial: {formatBRL(Number(c.saldo_inicial))}
              </p>
            </button>
          )
        })}
      </div>

      <ContaDrawer
        aberto={drawerAberto}
        fechar={() => setDrawerAberto(false)}
        conta={editando}
      />
    </>
  )
}
