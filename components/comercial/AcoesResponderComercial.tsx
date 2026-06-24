"use client"

import Link from "next/link"
import { useState } from "react"

/**
 * Ações no topo do painel Comercial:
 *   • "Responder relatório do dia" → abre o formulário comercial DENTRO do
 *     sistema (rota autenticada /dashboard/comercial/responder), sem precisar
 *     copiar link e abrir no navegador.
 *   • botão pequeno "Copiar link" → copia o link público (/formulario-comercial)
 *     pra responder na web, como alternativa.
 * Visível pra quem acessa o comercial (a página já é gated por
 * dashboard_comercial).
 */
export default function AcoesResponderComercial() {
  const [copiado, setCopiado] = useState(false)

  async function copiarLink() {
    if (typeof window === "undefined") return
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/formulario-comercial`
      )
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2400)
    } catch {
      // silencioso — o usuário pode usar o botão principal
    }
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        flexWrap: "wrap",
      }}
    >
      <Link
        href="/dashboard/comercial/responder"
        className="btn-gold-filled uppercase"
        style={{ textDecoration: "none" }}
      >
        Responder relatório do dia
      </Link>
      <button
        type="button"
        onClick={copiarLink}
        title="Copiar o link público pra responder na web (alternativa)"
        className="hover:text-[#C9953A] hover:border-[#C9953A55] transition no-ds"
        style={{
          padding: "8px 14px",
          fontSize: 11,
          letterSpacing: "0.5px",
          textTransform: "uppercase",
          color: copiado ? "#4caf50" : "rgba(255,255,255,0.55)",
          border: "0.5px solid rgba(255,255,255,0.15)",
          borderRadius: 6,
          background: "transparent",
          fontWeight: 500,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {copiado ? "Copiado ✓" : "Copiar link"}
      </button>
    </div>
  )
}
