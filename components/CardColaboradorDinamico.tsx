"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { salvarComissaoAction } from "@/lib/comissionamento-actions"
import type {
  Colaborador,
  Comissionamento,
  ConfiguracaoComissao,
  GatilhoConfig,
} from "@/lib/supabase"
import type { Ano, Mes } from "@/lib/data"
import { formatBRL } from "@/lib/data"

function calcularBonusEscala(entregas: number, config: ConfiguracaoComissao) {
  if (config.tipo !== "escala") return 0
  const ordenado = [...config.faixas].sort((a, b) => a.minimo - b.minimo)
  let bonus = 0
  for (const f of ordenado) {
    if (entregas >= f.minimo) bonus = f.bonus
  }
  return bonus
}

function formatarEntrada(raw: string): string {
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return raw
  return d
    .toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
    .replace(/^./, (c) => c.toUpperCase())
}

function calcularBonusGatilhos(
  detalhes: Record<string, boolean>,
  config: ConfiguracaoComissao
): number {
  if (config.tipo !== "gatilhos") return 0
  let total = 0
  for (const g of config.gatilhos) {
    if (detalhes[g.chave]) total += g.valor
  }
  return total
}

export default function CardColaboradorDinamico({
  colaborador,
  configuracao,
  existente,
  mes,
  ano,
  supabaseOk,
}: {
  colaborador: Colaborador
  configuracao: ConfiguracaoComissao
  existente: Comissionamento | null
  mes: Mes
  ano: Ano
  supabaseOk: boolean
}) {
  const key = colaborador.nome.toLowerCase()
  const [pending, startTransition] = useTransition()
  const [status, setStatus] = useState<string | null>(null)
  const router = useRouter()

  const [entregas, setEntregas] = useState<number>(
    existente?.entregas_validas ?? 0
  )
  const [flags, setFlags] = useState<Record<string, boolean>>(() => {
    const base: Record<string, boolean> = {}
    if (configuracao.tipo === "gatilhos") {
      for (const g of configuracao.gatilhos) {
        base[g.chave] = Boolean(existente?.detalhes?.[g.chave])
      }
    }
    return base
  })

  const bonusPreview =
    configuracao.tipo === "escala"
      ? calcularBonusEscala(entregas, configuracao)
      : calcularBonusGatilhos(flags, configuracao)
  const bonusSalvo = existente?.bonus_calculado ?? 0

  async function salvar() {
    const fd = new FormData()
    fd.set("colaborador", key)
    fd.set("mes", mes)
    fd.set("ano", String(ano))
    if (configuracao.tipo === "escala") {
      fd.set("entregas_validas", String(entregas))
    } else {
      for (const [chave, v] of Object.entries(flags)) {
        if (v) fd.set(chave, "on")
      }
    }
    const r = await salvarComissaoAction(fd)
    setStatus(r.ok ? "Salvo ✓" : r.erro ?? "Erro")
    if (r.ok) router.refresh()
  }

  return (
    <div className="glass" style={{ padding: 24 }}>
      <div className="flex items-center justify-between">
        <h3 style={{ fontSize: 16, fontWeight: 600, color: "#fff" }}>
          {colaborador.nome}
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
          {colaborador.funcao}
        </span>
      </div>
      <p
        style={{
          fontSize: 11,
          color: "rgba(255,255,255,0.35)",
          fontWeight: 300,
          marginTop: 4,
        }}
      >
        {colaborador.descricao ??
          (configuracao.tipo === "escala"
            ? "Bônus por entregas válidas no mês"
            : "Bônus por gatilhos de performance")}
      </p>

      {colaborador.data_entrada && (
        <p
          style={{
            fontSize: 9,
            color: "rgba(255,255,255,0.25)",
            fontWeight: 300,
            marginTop: 2,
          }}
        >
          No time desde {formatarEntrada(colaborador.data_entrada)}
        </p>
      )}

      {colaborador.observacoes && (
        <p
          style={{
            fontSize: 9,
            color: "rgba(255,255,255,0.2)",
            fontStyle: "italic",
            fontWeight: 300,
            marginTop: 2,
          }}
        >
          {colaborador.observacoes}
        </p>
      )}

      <div style={{ marginBottom: 16 }} />

      {configuracao.tipo === "escala" && (
        <div className="space-y-1" style={{ marginBottom: 14 }}>
          {configuracao.faixas.map((f, i) => {
            const ativa = bonusSalvo === f.bonus && f.bonus > 0
            return (
              <div
                key={i}
                className="flex items-center justify-between"
                style={{
                  padding: "6px 10px",
                  borderRadius: 6,
                  background: ativa ? "rgba(201,149,58,0.08)" : "transparent",
                  border: `0.5px solid ${
                    ativa ? "rgba(201,149,58,0.4)" : "rgba(255,255,255,0.04)"
                  }`,
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    color: ativa ? "#C9953A" : "rgba(255,255,255,0.35)",
                  }}
                >
                  A partir de {f.minimo} entregas
                </span>
                <span
                  style={{
                    fontSize: 11,
                    color: ativa ? "#C9953A" : "rgba(255,255,255,0.25)",
                    fontWeight: 500,
                  }}
                >
                  {formatBRL(f.bonus)}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {configuracao.tipo === "gatilhos" && (
        <div className="space-y-2" style={{ marginBottom: 14 }}>
          {configuracao.gatilhos.map((g: GatilhoConfig) => (
            <label
              key={g.chave}
              className="flex items-center justify-between gap-3 cursor-pointer"
              style={{
                padding: "10px 12px",
                border: `0.5px solid ${
                  flags[g.chave]
                    ? "rgba(76,175,80,0.3)"
                    : "rgba(255,255,255,0.06)"
                }`,
                background: flags[g.chave]
                  ? "rgba(76,175,80,0.06)"
                  : "transparent",
                borderRadius: 8,
              }}
            >
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={Boolean(flags[g.chave])}
                  onChange={(e) =>
                    setFlags({ ...flags, [g.chave]: e.target.checked })
                  }
                  style={{
                    width: 14,
                    height: 14,
                    accentColor: "#C9953A",
                  }}
                />
                <span style={{ fontSize: 12, color: "#fff", fontWeight: 400 }}>
                  {g.rotulo}
                </span>
              </div>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  color: flags[g.chave] ? "#4caf50" : "rgba(255,255,255,0.3)",
                }}
              >
                {formatBRL(g.valor)}
              </span>
            </label>
          ))}
        </div>
      )}

      {configuracao.tipo === "escala" && (
        <label className="block" style={{ marginBottom: 14 }}>
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
            value={entregas}
            min={0}
            onChange={(e) => setEntregas(Math.max(0, Number(e.target.value) || 0))}
            className="glass-input"
            style={{
              marginTop: 6,
              width: "100%",
              padding: "8px 12px",
              fontSize: 13,
            }}
          />
        </label>
      )}

      <div
        className="flex items-center justify-between"
        style={{
          paddingTop: 14,
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
          Bônus {bonusPreview !== bonusSalvo ? "prévia" : "calculado"}
        </span>
        <span
          style={{
            fontSize: 22,
            color: "#C9953A",
            fontWeight: 700,
            letterSpacing: "-0.3px",
          }}
        >
          {formatBRL(bonusPreview)}
        </span>
      </div>

      <div className="flex items-center gap-3 pt-3">
        <button
          type="button"
          onClick={() => startTransition(() => salvar())}
          disabled={pending || !supabaseOk}
          className="btn-gold-filled uppercase"
          style={{ opacity: pending || !supabaseOk ? 0.5 : 1 }}
        >
          {pending ? "Salvando..." : "Salvar"}
        </button>
        {status && (
          <span
            style={{
              fontSize: 11,
              color: status === "Salvo ✓" ? "#4caf50" : "#e24b4a",
            }}
          >
            {status}
          </span>
        )}
      </div>
    </div>
  )
}
