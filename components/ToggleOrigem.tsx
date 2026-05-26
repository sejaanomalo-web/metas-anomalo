"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import type { OrigemDadosReais } from "@/lib/data"

interface Props {
  origem: OrigemDadosReais
}

const OPCOES: { valor: OrigemDadosReais; rotulo: string; sub: string }[] = [
  { valor: "pago", rotulo: "Pago", sub: "Tráfego pago" },
  { valor: "organico", rotulo: "Orgânico", sub: "Prospecção fria" },
]

export default function ToggleOrigem({ origem }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function selecionar(valor: OrigemDadosReais) {
    if (valor === origem) return
    const params = new URLSearchParams(searchParams.toString())
    if (valor === "pago") params.delete("origem")
    else params.set("origem", valor)
    const query = params.toString()
    router.push(query ? `${pathname}?${query}` : pathname)
  }

  return (
    <div
      className="inline-flex items-center"
      style={{
        padding: 3,
        borderRadius: 999,
        border: "0.5px solid rgba(255,255,255,0.08)",
        background: "rgba(255,255,255,0.02)",
        gap: 2,
      }}
      role="tablist"
      aria-label="Origem dos leads"
    >
      {OPCOES.map((op) => {
        const ativo = op.valor === origem
        return (
          <button
            key={op.valor}
            type="button"
            role="tab"
            aria-selected={ativo}
            onClick={() => selecionar(op.valor)}
            style={{
              padding: "6px 14px",
              borderRadius: 999,
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: "1.2px",
              textTransform: "uppercase",
              background: ativo ? "rgba(201,149,58,0.18)" : "transparent",
              color: ativo ? "#C9953A" : "rgba(255,255,255,0.45)",
              border: `0.5px solid ${
                ativo ? "rgba(201,149,58,0.5)" : "transparent"
              }`,
              transition: "all 180ms ease",
            }}
          >
            <span>{op.rotulo}</span>
            <span
              style={{
                display: "block",
                fontSize: 8,
                letterSpacing: "1.5px",
                color: ativo ? "rgba(201,149,58,0.65)" : "rgba(255,255,255,0.3)",
                fontWeight: 400,
                marginTop: 2,
              }}
            >
              {op.sub}
            </span>
          </button>
        )
      })}
    </div>
  )
}
