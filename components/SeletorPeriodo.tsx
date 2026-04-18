"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { ANOS_DISPONIVEIS, MESES, type Ano, type Mes } from "@/lib/data"

const estilo: React.CSSProperties = {
  background: "#111111",
  border: "0.5px solid #1e1e1e",
  borderRadius: 4,
  padding: "6px 12px",
  fontSize: 12,
  color: "#888",
  fontWeight: 400,
  outline: "none",
}

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
        style={estilo}
      >
        {MESES.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
      <select
        value={anoAtual}
        onChange={(e) => atualizar("ano", e.target.value)}
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
