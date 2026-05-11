"use client"

import Image from "next/image"
import logo from "@/public/logo-anomalo.png"
import { useSidebar } from "@/components/AppShell"

/**
 * Logo Anômalo no header. Clicar dispara o toggle do rail (sidebar).
 * Consome o context do AppShell — só funciona dentro de uma árvore
 * que tenha o AppShell como ancestral (caso de /dashboard/*).
 */
export default function LogoToggle() {
  const { toggle, expandido } = useSidebar()

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={expandido ? "Recolher menu" : "Expandir menu"}
      title={expandido ? "Recolher menu" : "Expandir menu"}
      className="no-ds flex items-center gap-3 hover:opacity-90 transition"
      style={{
        background: "transparent",
        border: "none",
        cursor: "pointer",
        padding: 0,
        color: "inherit",
        fontFamily: "inherit",
        textTransform: "none",
        letterSpacing: "normal",
      }}
    >
      <Image
        src={logo}
        alt="Anômalo Hub"
        height={28}
        style={{ height: 28, width: "auto" }}
        priority
      />
      <div className="hidden sm:block leading-tight text-left">
        <p
          style={{
            fontSize: 14,
            color: "#C9953A",
            fontWeight: 600,
            letterSpacing: "-0.01em",
            lineHeight: 1.2,
          }}
        >
          Anômalo Hub
        </p>
        <p
          style={{
            fontSize: 11,
            color: "var(--text-3)",
            fontWeight: 400,
            marginTop: 2,
            lineHeight: 1.2,
          }}
        >
          Painel de Metas
        </p>
      </div>
    </button>
  )
}
