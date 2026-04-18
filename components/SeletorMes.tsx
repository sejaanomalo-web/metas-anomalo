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
    <label className="flex items-center gap-2">
      <span className="text-xs uppercase tracking-widest text-neutral-500">
        Mês
      </span>
      <select
        value={mesAtual}
        onChange={(e) => alterar(e.target.value)}
        className="bg-black border border-gold/30 text-white text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-gold"
      >
        {MESES.map((m) => (
          <option key={m} value={m}>
            {m} 2025
          </option>
        ))}
      </select>
    </label>
  )
}
