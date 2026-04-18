"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { GATILHOS_FELIPE, calcularBonusFelipe } from "@/lib/comissionamento"
import { salvarComissaoAction } from "@/lib/comissionamento-actions"
import type { Comissionamento } from "@/lib/supabase"
import type { Mes } from "@/lib/data"
import { formatBRL } from "@/lib/data"

export default function CardFelipe({
  mes,
  ano,
  existente,
  supabaseOk,
}: {
  mes: Mes
  ano: number
  existente: Comissionamento | null
  supabaseOk: boolean
}) {
  const inicial: Record<string, boolean> = {}
  for (const g of GATILHOS_FELIPE) {
    inicial[g.chave] = Boolean(existente?.detalhes?.[g.chave])
  }

  const [flags, setFlags] = useState<Record<string, boolean>>(inicial)
  const [pending, startTransition] = useTransition()
  const [status, setStatus] = useState<string | null>(null)
  const router = useRouter()

  const bonus = calcularBonusFelipe(flags)

  async function onSubmit(fd: FormData) {
    setStatus(null)
    const r = await salvarComissaoAction(fd)
    setStatus(r.ok ? "Salvo ✓" : r.erro ?? "Erro.")
    if (r.ok) router.refresh()
  }

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-base font-medium text-white">Felipe</h3>
        <span className="text-[10px] uppercase tracking-widest text-gold">
          Tráfego
        </span>
      </div>
      <p className="text-xs text-neutral-500 mb-5">
        Bônus por gatilhos de performance
      </p>

      <form
        action={(fd) => startTransition(() => onSubmit(fd))}
        className="space-y-3"
      >
        <input type="hidden" name="colaborador" value="felipe" />
        <input type="hidden" name="mes" value={mes} />
        <input type="hidden" name="ano" value={ano} />

        {GATILHOS_FELIPE.map((g) => (
          <label
            key={g.chave}
            className={`flex items-center justify-between gap-3 rounded-lg border p-3 cursor-pointer transition ${
              flags[g.chave]
                ? "bg-emerald-950/30 border-emerald-700/40"
                : "bg-black/40 border-neutral-900 hover:border-neutral-800"
            }`}
          >
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                name={g.chave}
                checked={flags[g.chave]}
                onChange={(e) =>
                  setFlags({ ...flags, [g.chave]: e.target.checked })
                }
                className="h-4 w-4 rounded border-gold/50 bg-black accent-[#C9953A]"
              />
              <span className="text-sm text-white">{g.rotulo}</span>
            </div>
            <span
              className={`text-xs font-medium ${
                flags[g.chave] ? "text-emerald-400" : "text-neutral-500"
              }`}
            >
              {formatBRL(g.valor)}
            </span>
          </label>
        ))}

        <div className="flex items-center justify-between pt-3 border-t border-neutral-900">
          <span className="text-xs uppercase tracking-widest text-neutral-500">
            Bônus total
          </span>
          <span className="text-xl font-medium text-gold">
            {formatBRL(bonus)}
          </span>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={pending || !supabaseOk}
            className="flex-1 gold-gradient text-black font-medium rounded-lg py-2.5 transition hover:brightness-110 disabled:opacity-50"
          >
            {pending ? "Salvando..." : "Salvar"}
          </button>
          {status && (
            <span
              className={`text-xs ${
                status === "Salvo ✓" ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {status}
            </span>
          )}
        </div>
      </form>
    </div>
  )
}
