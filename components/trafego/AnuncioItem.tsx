"use client"

import { useState } from "react"
import { formatBRL, formatNumero } from "@/lib/data"
import { COR } from "@/lib/design-tokens"
import type { AnuncioRanking } from "@/lib/anuncios"

/** Linha de anúncio (ad) com detalhe expansível (Entrega / Cliques /
 *  Conversões), no Gerenciador de Anúncios. Prints #4 e #5. */
function pct(v: number | null): string {
  return v == null ? "—" : `${(v * 100).toFixed(2).replace(".", ",")}%`
}
function brlOuTraco(v: number | null): string {
  return v == null ? "—" : formatBRL(v)
}
function num(v: number | null): string {
  return v == null ? "—" : formatNumero(v)
}

export default function AnuncioItem({ a }: { a: AnuncioRanking }) {
  const [aberto, setAberto] = useState(false)
  const ativa = a.status === "ACTIVE"
  const corStatus =
    a.status == null ? "var(--text-4)" : ativa ? COR.conversas : "var(--text-4)"
  const rotuloStatus = a.status == null ? "—" : ativa ? "Ativo" : "Pausado"

  return (
    <div className="glass" style={{ padding: 0, overflow: "hidden" }}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        style={{
          width: "100%",
          textAlign: "left",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          padding: "16px 20px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          color: "inherit",
        }}
      >
        <span aria-hidden="true" style={{ color: COR.compras, display: "inline-flex", flexShrink: 0 }}>
          <IconeImagem />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: "var(--text-1)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={a.nome}
          >
            {a.nome}
          </p>
          <p style={{ fontSize: 12, color: corStatus, fontWeight: 600, marginTop: 2 }}>
            {rotuloStatus}
          </p>
        </div>
        <span
          className="hide-sm"
          style={{ fontSize: 12, color: "var(--text-3)", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}
        >
          Gasto <strong style={{ color: "var(--text-1)" }}>{formatBRL(a.investimento)}</strong>
          {"  ·  "}Alcance <strong style={{ color: "var(--text-1)" }}>{formatNumero(a.alcance)}</strong>
          {"  ·  "}Cliques <strong style={{ color: "var(--text-1)" }}>{formatNumero(a.cliques)}</strong>
        </span>
        <span aria-hidden="true" style={{ color: "var(--text-4)", fontSize: 12, flexShrink: 0 }}>
          {aberto ? "▲" : "▼"}
        </span>
      </button>

      {aberto && (
        <div style={{ padding: "0 20px 20px" }}>
          <div style={{ height: 1, background: "rgba(255,255,255,0.06)", marginBottom: 16 }} />

          <Grupo titulo="Entrega">
            <Item label="Alcance" valor={formatNumero(a.alcance)} sub="pessoas diferentes" />
            <Item label="Impressões" valor={formatNumero(a.impressoes)} sub="vezes que apareceu" />
            <Item label="Frequência" valor={a.frequencia == null ? "—" : a.frequencia.toFixed(1)} sub="vezes por pessoa" />
            <Item label="CPM" valor={brlOuTraco(a.cpm)} sub="custo por mil impressões" />
          </Grupo>

          <Grupo titulo="Cliques">
            <Item label="Cliques no link" valor={formatNumero(a.cliques)} />
            <Item label="Todos os cliques" valor={formatNumero(a.todosCliques)} />
            <Item label="CTR" valor={pct(a.ctr)} sub="taxa de cliques" />
            <Item label="CPC" valor={brlOuTraco(a.cpc)} sub="custo por clique" />
          </Grupo>

          <Grupo titulo="Conversões">
            <Item label="Compras" valor={num(a.compras)} cor={COR.compras} />
            <Item label="Adicionou ao carrinho" valor={num(a.carrinho)} cor={COR.carrinho} />
            <Item label="Iniciou checkout" valor={num(a.checkout)} />
            <Item label="Visualizou página" valor={num(a.view)} />
          </Grupo>

          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14 }}>
            <span aria-hidden="true" style={{ color: COR.gasto }}>$</span>
            <span style={{ fontSize: 12, color: "var(--text-3)" }}>Valor gasto:</span>
            <strong style={{ fontSize: 16, color: "var(--text-1)" }}>{formatBRL(a.investimento)}</strong>
          </div>
        </div>
      )}
    </div>
  )
}

function Grupo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <p
        style={{
          fontSize: 10,
          letterSpacing: "1px",
          textTransform: "uppercase",
          color: "var(--text-4)",
          fontWeight: 600,
          marginBottom: 10,
        }}
      >
        {titulo}
      </p>
      <div className="grid grid-cols-2 lg:grid-cols-4" style={{ gap: 14 }}>
        {children}
      </div>
    </div>
  )
}

function Item({
  label,
  valor,
  sub,
  cor,
}: {
  label: string
  valor: string
  sub?: string
  cor?: string
}) {
  return (
    <div style={{ minWidth: 0 }}>
      <p style={{ fontSize: 11, color: "var(--text-4)", marginBottom: 2 }}>{label}</p>
      <p
        style={{
          fontSize: 18,
          fontWeight: 700,
          color: cor ?? "var(--text-1)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {valor}
      </p>
      {sub && <p style={{ fontSize: 10, color: "var(--text-4)", marginTop: 1 }}>{sub}</p>}
    </div>
  )
}

function IconeImagem() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  )
}
