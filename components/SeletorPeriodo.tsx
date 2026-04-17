"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { ANOS_DISPONIVEIS, MESES, type Ano, type Mes } from "@/lib/data"

const estilo = {
  background: "#111111",
  border: "0.5px solid #1e1e1e",
  borderRadius: 4,
  padding: "6px 12px",
  fontSize: 10,
  color: "#686868",
  fontWeight: 300,
  letterSpacing: "0.5px",
  outline: "none",
} as const

export default function SeletorPeriodo({
  mesAtual,
  anoAtual,
}: {
  mesAtual: Mes
  anoAtual: Ano
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function atualizar(param: "mes" | "ano", valor: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set(param, valor)
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={mesAtual}
        onChange={(e) => atualizar("mes", e.target.value)}
        className="font-mono"
        style={estilo}
      >
        {MESES.map((m) => (
          <option key={m} value={m}>
            {m.toUpperCase()}
          </option>
        ))}
      </select>
      <select
        value={anoAtual}
        onChange={(e) => atualizar("ano", e.target.value)}
        className="font-mono"
        style={estilo}
      >
        {ANOS_DISPONIVEIS.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </select>
    </div>
  )
}
