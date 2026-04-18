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
    <div className="glass" style={{ padding: 24 }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: "#ffffff" }}>
          {nome}
        </h3>
        <span
          style={{
            fontSize: 9,
            letterSpacing: "2px",
            color: "#C9953A",
            textTransform: "uppercase",
            fontWeight: 500,
          }}
        >
          {funcao}
        </span>
      </div>
      <p
        style={{
          fontSize: 11,
          color: "rgba(255,255,255,0.35)",
          fontWeight: 300,
          marginBottom: 18,
        }}
      >
        Bônus por entregas válidas no mês
      </p>

      <div className="space-y-1" style={{ marginBottom: 18 }}>
        {faixas.map((f) => {
          const ativo = bonus === f.valor && f.valor > 0
          return (
            <div
              key={f.rotulo}
              className="flex items-center justify-between"
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: ativo
                  ? "0.5px solid rgba(201,149,58,0.4)"
                  : "0.5px solid rgba(255,255,255,0.04)",
                background: ativo ? "rgba(201,149,58,0.08)" : "transparent",
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  color: ativo ? "#C9953A" : "rgba(255,255,255,0.4)",
                  fontWeight: 400,
                }}
              >
                {f.rotulo}
              </span>
              <span
                style={{
                  fontSize: 11,
                  color: ativo ? "#C9953A" : "rgba(255,255,255,0.25)",
                  fontWeight: 500,
                }}
              >
                {formatBRL(f.valor)}
              </span>
            </div>
          )
        })}
      </div>

      <p
        style={{
          fontSize: 10,
          color: "rgba(255,255,255,0.35)",
          fontWeight: 300,
          marginBottom: 14,
        }}
      >
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
          <span
            style={{
              fontSize: 9,
              letterSpacing: "2px",
              color: "rgba(255,255,255,0.35)",
              textTransform: "uppercase",
              fontWeight: 500,
            }}
          >
            Entregas válidas no mês
          </span>
          <input
            type="number"
            name="entregas_validas"
            min={0}
            value={entregas}
            onChange={(e) => setEntregas(Number(e.target.value) || 0)}
            className="glass-input"
            style={{
              marginTop: 8,
              width: "100%",
              padding: "10px 14px",
              fontSize: 13,
              fontWeight: 400,
            }}
          />
        </label>

        <div
          className="flex items-center justify-between"
          style={{
            paddingTop: 16,
            borderTop: "0.5px solid rgba(255,255,255,0.05)",
          }}
        >
          <span
            style={{
              fontSize: 9,
              letterSpacing: "2px",
              color: "rgba(255,255,255,0.35)",
              textTransform: "uppercase",
              fontWeight: 500,
            }}
          >
            Bônus calculado
          </span>
          <span
            style={{
              fontSize: 22,
              color: "#C9953A",
              fontWeight: 700,
              letterSpacing: "-0.3px",
            }}
          >
            {formatBRL(bonus)}
          </span>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={pending || !supabaseOk}
            className="btn-gold-solid flex-1"
            style={{
              padding: "10px 0",
              fontSize: 11,
              letterSpacing: "0.5px",
              textTransform: "uppercase",
              opacity: pending || !supabaseOk ? 0.5 : 1,
            }}
          >
            {pending ? "Salvando..." : "Salvar"}
          </button>
          {status && (
            <span
              style={{
                fontSize: 11,
                color: status === "Salvo ✓" ? "#4caf50" : "#e24b4a",
                fontWeight: 400,
              }}
            >
              {status}
            </span>
          )}
        </div>
      </form>
    </div>
  )
}
