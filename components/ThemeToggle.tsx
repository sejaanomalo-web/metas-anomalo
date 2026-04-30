"use client"

import { useEffect, useState } from "react"

type Theme = "dark" | "light" | "yellow"

const ORDER: Theme[] = ["dark", "light", "yellow"]

const META: Record<
  Theme,
  { label: string; swatch: string; next: string }
> = {
  dark: { label: "Preto", swatch: "#000000", next: "Branco" },
  light: { label: "Branco", swatch: "#faf7f0", next: "Amarelo" },
  yellow: { label: "Amarelo", swatch: "#C9953A", next: "Preto" },
}

function readTheme(): Theme {
  if (typeof document === "undefined") return "dark"
  const t = document.documentElement.getAttribute("data-theme")
  return t === "light" || t === "yellow" ? t : "dark"
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark")
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setTheme(readTheme())
    setMounted(true)
  }, [])

  function cycle() {
    const idx = ORDER.indexOf(theme)
    const next = ORDER[(idx + 1) % ORDER.length]
    setTheme(next)
    document.documentElement.setAttribute("data-theme", next)
    try {
      localStorage.setItem("anomalo-theme", next)
    } catch {}
  }

  const meta = META[theme]

  return (
    <button
      type="button"
      onClick={cycle}
      className="theme-toggle"
      aria-label={`Tema atual: ${meta.label}. Clique para alternar para ${meta.next}.`}
      title={`Tema: ${meta.label} → ${meta.next}`}
      suppressHydrationWarning
    >
      <span
        className="swatch"
        style={{ background: meta.swatch }}
        aria-hidden="true"
      />
      <span style={{ opacity: mounted ? 1 : 0.6 }}>{meta.label}</span>
    </button>
  )
}
