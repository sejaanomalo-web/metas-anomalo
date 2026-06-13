"use client"

import { useRef, useState } from "react"

/**
 * Botão discreto do header do dashboard do cliente: copia o link público
 * do formulário de vendas (/vendas/<token>) pra mandar pro cliente no
 * WhatsApp. Mesmo estilo ghost do "Copiar link público" do FormularioManual.
 */
export default function BotaoLinkVendas({ token }: { token: string }) {
  const [copiado, setCopiado] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function copiar() {
    if (typeof window === "undefined") return
    const url = `${window.location.origin}/vendas/${token}`
    try {
      await navigator.clipboard.writeText(url)
      setCopiado(true)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopiado(false), 2400)
    } catch {
      // Clipboard bloqueado (http/permissão): mostra o link pra cópia manual.
      window.prompt("Copie o link de vendas:", url)
    }
  }

  return (
    <button
      type="button"
      onClick={copiar}
      title="Link público pro cliente registrar vendas (sem login)"
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
      {copiado ? "Link copiado ✓" : "🔗 Link de vendas"}
    </button>
  )
}
