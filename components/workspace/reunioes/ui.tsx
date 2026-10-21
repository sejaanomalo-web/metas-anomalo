"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import type { ResultadoReunioes } from "@/lib/reunioes-actions"

/** Peças compartilhadas da aba Reuniões — mesmo vocabulário visual do
 *  Workspace (cards `glass`, botão dourado só pra ação principal). */

export function Cartao({
  titulo,
  subtitulo,
  acoes,
  children,
}: {
  titulo: React.ReactNode
  subtitulo?: React.ReactNode
  acoes?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <section className="glass" style={{ padding: 14, borderRadius: 10, display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 220px", minWidth: 0 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, margin: 0, color: "var(--text-1)" }}>{titulo}</h3>
          {subtitulo && <p style={{ fontSize: 11, color: "var(--text-4)", margin: "3px 0 0" }}>{subtitulo}</p>}
        </div>
        {acoes && <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{acoes}</div>}
      </div>
      {children}
    </section>
  )
}

export const estiloBotao = (variante: "principal" | "neutro" | "perigo" = "neutro", desabilitado = false): React.CSSProperties => ({
  fontSize: 12,
  fontWeight: 600,
  padding: "6px 12px",
  borderRadius: 6,
  cursor: desabilitado ? "not-allowed" : "pointer",
  opacity: desabilitado ? 0.5 : 1,
  border:
    variante === "perigo" ? "1px solid rgba(226,75,74,0.5)" :
    variante === "principal" ? "1px solid var(--accent)" : "1px solid rgba(255,255,255,0.14)",
  background: variante === "principal" ? "var(--accent)" : "transparent",
  color: variante === "principal" ? "#1e1f21" : variante === "perigo" ? "#e24b4a" : "var(--text-1)",
  whiteSpace: "nowrap",
})

export const estiloCampo: React.CSSProperties = { fontSize: 12, padding: "6px 9px", borderRadius: 6, minWidth: 0 }

export function Rotulo({ texto, children, dica }: { texto: string; children: React.ReactNode; dica?: string }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, color: "var(--text-3)", minWidth: 0 }}>
      <span>{texto}</span>
      {children}
      {dica && <span style={{ fontSize: 10, color: "var(--text-4)" }}>{dica}</span>}
    </label>
  )
}

export function Mensagem({ r }: { r: ResultadoReunioes | null }) {
  if (!r) return null
  return (
    <div role="status" style={{ fontSize: 11, display: "flex", flexDirection: "column", gap: 3 }}>
      {r.mensagem && <span style={{ color: "#5da283" }}>{r.mensagem}</span>}
      {r.erro && <span style={{ color: "#e24b4a" }}>{r.erro}</span>}
      {r.itens?.map((i) => (
        <span key={i.rotulo} style={{ color: i.ok ? "var(--text-2)" : "#e24b4a" }}>
          {i.ok ? "✓" : "✗"} {i.rotulo}
          {i.detalhe ? ` — ${i.detalhe}` : ""}
        </span>
      ))}
    </div>
  )
}

/** Hook: roda uma action, guarda o resultado e dá refresh na página. */
export function useAcao() {
  const router = useRouter()
  const [pendente, startTransition] = useTransition()
  const [resultado, setResultado] = useState<ResultadoReunioes | null>(null)
  function rodar(fn: () => Promise<ResultadoReunioes>) {
    setResultado(null)
    startTransition(async () => {
      try {
        setResultado(await fn())
      } catch {
        setResultado({ ok: false, erro: "Falha inesperada. Tente de novo." })
      }
      router.refresh()
    })
  }
  return { pendente, resultado, rodar, setResultado }
}

/** Botão que copia texto — usado nos links das campanhas. */
export function BotaoCopiar({ texto, rotulo = "Copiar link" }: { texto: string; rotulo?: string }) {
  const [copiado, setCopiado] = useState(false)
  return (
    <button
      type="button"
      className="no-ds"
      style={estiloBotao("neutro")}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(texto)
          setCopiado(true)
          setTimeout(() => setCopiado(false), 1800)
        } catch {
          setCopiado(false)
        }
      }}
    >
      {copiado ? "Copiado ✓" : rotulo}
    </button>
  )
}
