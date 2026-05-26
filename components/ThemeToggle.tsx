"use client"

import { useEffect, useState } from "react"

type Theme = "dark" | "light" | "mono" | "gold"

const ORDER: Theme[] = ["dark", "light", "mono", "gold"]

const META: Record<
  Theme,
  { label: string; swatch: string; next: string }
> = {
  dark: {
    label: "Preto",
    swatch: "linear-gradient(135deg, #000 50%, #1a1410 50%)",
    next: "Branco",
  },
  light: {
    label: "Branco",
    swatch: "linear-gradient(135deg, #faf7f0 50%, #0a0a0a 50%)",
    next: "Contraste",
  },
  mono: {
    label: "Contraste",
    swatch: "linear-gradient(135deg, #000 50%, #ffffff 50%)",
    next: "Dourado",
  },
  gold: {
    label: "Dourado",
    swatch: "linear-gradient(135deg, #000 50%, #C9953A 50%)",
    next: "Preto",
  },
}

function readTheme(): Theme {
  if (typeof document === "undefined") return "dark"
  const t = document.documentElement.getAttribute("data-theme")
  if (t === "light" || t === "mono" || t === "gold" || t === "dark") return t
  return "dark"
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
