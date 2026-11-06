"use client"

import { useTransition } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import type { UsuarioComercial } from "@/lib/funis-comerciais"

/** Só para admin: escolhe de quem é a interface comercial que está aberta. */
export default function SeletorUsuarioFunil({
  usuarios,
  atual,
}: {
  usuarios: UsuarioComercial[]
  atual: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pendente, startNav] = useTransition()

  return (
    <label
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        fontSize: 12,
        fontWeight: 500,
        color: "var(--text-2)",
        opacity: pendente ? 0.65 : 1,
      }}
    >
      Ver funis de
      <select
        className="glass-input"
        style={{ padding: "8px 10px", minHeight: 38, fontSize: 12 }}
        value={atual}
        onChange={(e) => {
          const params = new URLSearchParams(searchParams.toString())
          params.set("usuario", e.target.value)
          params.delete("funil") // cada pessoa tem os próprios funis
          startNav(() => {
            router.push(`${pathname}?${params.toString()}`, { scroll: false })
          })
        }}
      >
        {usuarios.map((u) => (
          <option key={u.id} value={u.id} style={{ background: "#121826" }}>
            {u.nome}
          </option>
        ))}
      </select>
    </label>
  )
}
