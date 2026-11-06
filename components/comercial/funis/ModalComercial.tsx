"use client"

import { useEffect, useRef, type ReactNode } from "react"
import { createPortal } from "react-dom"

const FOCAVEIS =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled])'

/**
 * Diálogo dos funis. Vai para o body via portal: o hero tem efeitos que criam
 * um novo contexto para `position: fixed`. Não fecha ao clicar fora, porque o
 * formulário cheio de números se perderia com um clique errado.
 */
export default function ModalComercial({
  titulo,
  fechar,
  children,
  largura = 540,
}: {
  titulo: string
  fechar: () => void
  children: ReactNode
  largura?: number
}) {
  const painelRef = useRef<HTMLDivElement>(null)
  const fecharRef = useRef(fechar)
  fecharRef.current = fechar

  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null
    const painel = painelRef.current
    const primeiro = painel?.querySelector<HTMLElement>("[data-autofoco]")
    ;(primeiro ?? painel)?.focus()

    function aoTeclar(ev: KeyboardEvent) {
      if (ev.key === "Escape") {
        ev.preventDefault()
        fecharRef.current()
        return
      }
      if (ev.key !== "Tab" || !painel) return
      const itens = Array.from(painel.querySelectorAll<HTMLElement>(FOCAVEIS))
      if (itens.length === 0) return
      const ultimo = itens[itens.length - 1]
      const atual = document.activeElement
      if (ev.shiftKey && (atual === itens[0] || atual === painel)) {
        ev.preventDefault()
        ultimo.focus()
      } else if (!ev.shiftKey && atual === ultimo) {
        ev.preventDefault()
        itens[0].focus()
      }
    }

    document.addEventListener("keydown", aoTeclar)
    const overflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", aoTeclar)
      document.body.style.overflow = overflow
      anterior?.focus?.()
    }
  }, [])

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 120,
        background: "rgba(0,0,0,0.70)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding:
          "max(16px, env(safe-area-inset-top)) 16px max(16px, env(safe-area-inset-bottom))",
        overflowY: "auto",
      }}
    >
      <div
        ref={painelRef}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        tabIndex={-1}
        style={{
          width: `min(${largura}px, 100%)`,
          marginBlock: "auto",
          background: "var(--surface-1)",
          border: "0.5px solid rgba(255,255,255,0.12)",
          borderRadius: 14,
          padding: "22px 24px",
          outline: "none",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 16,
          }}
        >
          <h2 style={{ fontSize: 19 }}>{titulo}</h2>
          <button
            type="button"
            onClick={fechar}
            aria-label="Fechar"
            style={{
              width: 36,
              height: 36,
              flexShrink: 0,
              fontSize: 20,
              lineHeight: 1,
              color: "var(--text-3)",
              background: "transparent",
              border: "none",
              cursor: "pointer",
            }}
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  )
}

export const estiloRotulo: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 500,
  color: "var(--text-2)",
}

export const estiloCampo: React.CSSProperties = {
  marginTop: 6,
  width: "100%",
  padding: "9px 12px",
  fontSize: 13,
}

export function MensagemErro({ erro }: { erro: string | null }) {
  if (!erro) return null
  return (
    <p
      role="alert"
      style={{
        marginTop: 14,
        padding: "10px 12px",
        borderRadius: 8,
        fontSize: 13,
        color: "#fca5a5",
        background: "rgba(239,68,68,0.10)",
        border: "1px solid rgba(239,68,68,0.35)",
      }}
    >
      {erro}
    </p>
  )
}
