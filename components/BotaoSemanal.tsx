"use client"

import Link from "next/link"
import { useEffect, useState } from "react"

export default function BotaoSemanal() {
  const [sexta, setSexta] = useState(false)

  useEffect(() => {
    const d = new Date()
    // BRT é UTC-3, mas usamos o dia local do navegador do usuário — suficiente
    setSexta(d.getDay() === 5)
  }, [])

  if (sexta) {
    return (
      <Link
        href="/dashboard/semanal"
        className="btn-semanal-pulse uppercase"
      >
        Inserir dados da semana
      </Link>
    )
  }

  return (
    <Link
      href="/dashboard/semanal"
      style={{
        fontSize: 10,
        color: "rgba(255,255,255,0.35)",
        fontWeight: 500,
        letterSpacing: "0.5px",
        padding: "6px 12px",
        border: "0.5px solid rgba(255,255,255,0.08)",
        borderRadius: 8,
      }}
      className="hover:text-[#C9953A] hover:border-[#C9953A55] transition uppercase hidden md:inline"
    >
      Dados da semana
    </Link>
  )
}
