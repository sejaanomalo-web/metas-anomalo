"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { salvarComissaoAction } from "@/lib/comissionamento-actions"
import {
  calcularBonusEmanuel,
  calcularBonusVinicius,
} from "@/lib/comissionamento"
import type { Comissionamento } from "@/lib/supabase"
import type { Mes } from "@/lib/data"
import { formatBRL } from "@/lib/data"

interface Faixa {
  limite: number | null
  valor: number
  rotulo: string
}

export default function CardEditor({
  colaborador,
  nome,
  funcao,
  faixas,
  mes,
  ano,
  existente,
  supabaseOk,
}: {
  colaborador: "vinicius" | "emanuel"
  nome: string
  funcao: string
  faixas: Faixa[]
  mes: Mes
  ano: number
  existente: Comissionamento | null
  supabaseOk: boolean
}) {
  const [entregas, setEntregas] = useState<number>(
    existente?.entregas_validas ?? 0
  )
  const [pending, startTransition] = useTransition()
  const [status, setStatus] = useState<string | null>(null)
  const router = useRouter()

  const calcular =
    colaborador === "vinicius" ? calcularBonusVinicius : calcularBonusEmanuel
  const bonus = calcular(entregas)

  async function onSubmit(fd: FormData) {
    setStatus(null)
    const r = await salvarComissaoAction(fd)
    setStatus(r.ok ? "Salvo ✓" : r.erro ?? "Erro.")
    if (r.ok) router.refresh()
  }

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-base font-medium text-white">{nome}</h3>
        <span className="text-[10px] uppercase tracking-widest text-gold">
          {funcao}
        </span>
      </div>
      <p className="text-xs text-neutral-500 mb-5">
        Bônus por entregas válidas no mês
      </p>

      <div className="space-y-1.5 mb-5">
        {faixas.map((f) => {
          const ativo = bonus === f.valor && f.valor > 0
          return (
            <div
              key={f.rotulo}
              className={`flex items-center justify-between px-3 py-1.5 rounded border ${
                ativo
                  ? "bg-gold/10 border-gold/50"
                  : "bg-transparent border-neutral-900"
              }`}
            >
              <span
                className={`text-xs ${ativo ? "text-gold" : "text-neutral-500"}`}
              >
                {f.rotulo}
              </span>
              <span
                className={`text-xs font-medium ${
                  ativo ? "text-gold" : "text-neutral-600"
                }`}
              >
                {formatBRL(f.valor)}
              </span>
            </div>
          )
        })}
      </div>

      <p className="text-[11px] text-neutral-500 mb-4">
        Regra: entrega fora do prazo ou com 3+ revisões por erro de atenção não
        conta.
      </p>

      <form
        action={(fd) => startTransition(() => onSubmit(fd))}
        className="space-y-4"
      >
        <input type="hidden" name="colaborador" value={colaborador} />
        <input type="hidden" name="mes" value={mes} />
        <input type="hidden" name="ano" value={ano} />

        <label className="block">
          <span className="text-xs uppercase tracking-widest text-neutral-400">
            Entregas válidas no mês
          </span>
          <input
            type="number"
            name="entregas_validas"
            min={0}
            value={entregas}
            onChange={(e) => setEntregas(Number(e.target.value) || 0)}
            className="mt-2 w-full rounded-lg bg-black/60 border border-neutral-800 focus:border-gold focus:outline-none px-3 py-2 text-white text-sm"
          />
        </label>

        <div className="flex items-center justify-between pt-3 border-t border-neutral-900">
          <span className="text-xs uppercase tracking-widest text-neutral-500">
            Bônus calculado
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
