"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { MESES, type Mes } from "@/lib/data"

export default function SeletorMes({ mesAtual }: { mesAtual: Mes }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function alterar(valor: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set("mes", valor)
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <select
      value={mesAtual}
      onChange={(e) => alterar(e.target.value)}
      className="glass-input"
      style={{
        padding: "8px 14px",
        fontSize: 11,
        fontWeight: 500,
        color: "rgba(255,255,255,0.7)",
      }}
    >
      {MESES.map((m) => (
        <option key={m} value={m} style={{ background: "#0a0a0a" }}>
          {m} 2025
        </option>
      ))}
    </select>
  )
}
