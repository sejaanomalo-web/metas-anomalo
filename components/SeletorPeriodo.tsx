"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { ANOS_DISPONIVEIS, MESES, type Ano, type Mes } from "@/lib/data"

const estilo: React.CSSProperties = {
  padding: "8px 12px",
  fontSize: 12,
  fontWeight: 500,
  color: "var(--text-2)",
}

const optionStyle: React.CSSProperties = { background: "#121826" }

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
        className="glass-input"
        style={estilo}
      >
        {MESES.map((m) => (
          <option key={m} value={m} style={optionStyle}>
            {m}
          </option>
        ))}
      </select>
      <select
        value={anoAtual}
        onChange={(e) => atualizar("ano", e.target.value)}
        className="glass-input"
        style={estilo}
      >
        {ANOS_DISPONIVEIS.map((a) => (
          <option key={a} value={a} style={optionStyle}>
            {a}
          </option>
        ))}
      </select>
    </div>
  )
}
