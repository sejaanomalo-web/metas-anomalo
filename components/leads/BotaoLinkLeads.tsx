"use client"

import { useRef, useState } from "react"

/**
 * Copia o link do dashboard de leads do cliente (/leads/<token>) pra colar no
 * WhatsApp. É ESTE o mecanismo de entrega do módulo — não há envio automático:
 * o time copia daqui e manda pro cliente.
 *
 * Mesmo padrão do BotaoLinkVendas, incluindo o fallback de window.prompt
 * quando a Clipboard API está bloqueada (acontece em http local e em alguns
 * navegadores sem permissão).
 */
export default function BotaoLinkLeads({
  token,
  rotulo = "🔗 Copiar link de leads",
}: {
  token: string
  rotulo?: string
}) {
  const [copiado, setCopiado] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function copiar() {
    if (typeof window === "undefined") return
    const url = `${window.location.origin}/leads/${token}`
    try {
      await navigator.clipboard.writeText(url)
      setCopiado(true)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopiado(false), 2400)
    } catch {
      window.prompt("Copie o link de leads:", url)
    }
  }

  return (
    <button
      type="button"
      onClick={copiar}
      title="Link do painel de leads do cliente (sem login)"
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
      {copiado ? "Link copiado ✓" : rotulo}
    </button>
  )
}
