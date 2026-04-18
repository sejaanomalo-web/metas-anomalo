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
    <div className="glass" style={{ padding: 24 }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: "#ffffff" }}>
          Felipe
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
          Tráfego
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
            className="flex items-center justify-between gap-3 cursor-pointer transition"
            style={{
              padding: "12px 14px",
              borderRadius: 10,
              border: flags[g.chave]
                ? "0.5px solid rgba(76,175,80,0.4)"
                : "0.5px solid rgba(255,255,255,0.08)",
              background: flags[g.chave]
                ? "rgba(76,175,80,0.08)"
                : "rgba(255,255,255,0.02)",
            }}
          >
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                name={g.chave}
                checked={flags[g.chave]}
                onChange={(e) =>
                  setFlags({ ...flags, [g.chave]: e.target.checked })
                }
                style={{
                  width: 16,
                  height: 16,
                  accentColor: "#C9953A",
                }}
              />
              <span style={{ fontSize: 13, color: "#ffffff", fontWeight: 400 }}>
                {g.rotulo}
              </span>
            </div>
            <span
              style={{
                fontSize: 12,
                fontWeight: 500,
                color: flags[g.chave] ? "#4caf50" : "rgba(255,255,255,0.3)",
              }}
            >
              {formatBRL(g.valor)}
            </span>
          </label>
        ))}

        <div
          className="flex items-center justify-between"
          style={{
            paddingTop: 16,
            borderTop: "0.5px solid rgba(255,255,255,0.05)",
            marginTop: 4,
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
            Bônus total
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
