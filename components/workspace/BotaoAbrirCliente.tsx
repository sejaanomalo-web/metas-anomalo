"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { garantirContextoDoClienteAction } from "@/lib/workspace-actions"

/**
 * Abre a "pasta" de um cliente. Se o contexto ainda não existir, ele é criado
 * na hora (sob demanda) — por isso isto é um botão com action, não um Link.
 *
 * Não duplica cadastro de cliente: o contexto só APONTA para
 * cliente_trafego.id, e o índice único parcial no banco garante uma pasta
 * ativa por cliente mesmo se dois cliques chegarem juntos.
 */
export default function BotaoAbrirCliente({
  clienteId,
  nome,
  contextoId,
  pendentes,
  atrasadas,
}: {
  clienteId: string
  nome: string
  contextoId: string | null
  pendentes: number
  atrasadas: number
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)

  function abrir() {
    if (contextoId) {
      router.push(`/dashboard/workspace?contexto=${contextoId}`)
      return
    }
    setErro(null)
    startTransition(async () => {
      const fd = new FormData()
      fd.set("cliente_id", clienteId)
      const r = await garantirContextoDoClienteAction(fd)
      if (!r.ok || !r.id) {
        setErro(r.erro ?? "Não foi possível abrir.")
        return
      }
      router.push(`/dashboard/workspace?contexto=${r.id}`)
    })
  }

  return (
    <button
      type="button"
      onClick={abrir}
      disabled={pending}
      className="glass glass-hover no-ds"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        width: "100%",
        padding: "10px 12px",
        borderRadius: 10,
        border: "none",
        cursor: pending ? "wait" : "pointer",
        textAlign: "left",
        color: "inherit",
        opacity: pending ? 0.6 : 1,
      }}
    >
      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>
        {nome}
        {erro && (
          <span style={{ display: "block", fontSize: 10, color: "#e24b4a", fontWeight: 400 }}>
            {erro}
          </span>
        )}
      </span>

      <span style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
        {atrasadas > 0 && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              padding: "2px 7px",
              borderRadius: 999,
              background: "rgba(226,75,74,0.14)",
              color: "#e24b4a",
              whiteSpace: "nowrap",
            }}
          >
            {atrasadas} atrasada{atrasadas === 1 ? "" : "s"}
          </span>
        )}
        <span
          style={{
            fontSize: 10,
            padding: "2px 7px",
            borderRadius: 999,
            background: "var(--surface-3)",
            color: "var(--text-3)",
            whiteSpace: "nowrap",
          }}
        >
          {pendentes} pendente{pendentes === 1 ? "" : "s"}
        </span>
      </span>
    </button>
  )
}
