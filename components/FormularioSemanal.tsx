"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import type { DadosReais } from "@/lib/supabase"
import type { Mes } from "@/lib/data"
import { formatBRL } from "@/lib/data"
import { salvarDadosSemanaAction } from "@/lib/semanal-actions"

interface EmpresaLinha {
  slug: string
  db: string
  nome: string
  subtitulo: string
  tipo: string
  meta: number
  existente: DadosReais | null
}

function calcularVinicius(n: number): number {
  if (n < 10) return 0
  if (n < 15) return 100
  if (n < 20) return 200
  if (n < 25) return 350
  if (n < 30) return 500
  return 700
}

function calcularEmanuel(n: number): number {
  if (n < 5) return 0
  if (n < 8) return 100
  if (n < 11) return 200
  if (n < 15) return 350
  return 500
}

export default function FormularioSemanal({
  mes,
  ano,
  empresas,
  acumuladoVinicius,
  acumuladoEmanuel,
}: {
  mes: Mes
  ano: number
  empresas: EmpresaLinha[]
  acumuladoVinicius: number
  acumuladoEmanuel: number
}) {
  const [faturamentos, setFaturamentos] = useState<Record<string, string>>({})
  const [reunioes, setReunioes] = useState<Record<string, string>>({})
  const [contratos, setContratos] = useState<Record<string, string>>({})
  const [vinicius, setVinicius] = useState("")
  const [emanuel, setEmanuel] = useState("")
  const [pending, startTransition] = useTransition()
  const [status, setStatus] = useState<string | null>(null)
  const router = useRouter()

  const novoVinicius = Number(vinicius) || 0
  const novoEmanuel = Number(emanuel) || 0
  const bonusVinicius = calcularVinicius(acumuladoVinicius + novoVinicius)
  const bonusEmanuel = calcularEmanuel(acumuladoEmanuel + novoEmanuel)

  async function salvar() {
    const fd = new FormData()
    fd.set("mes", mes)
    fd.set("ano", String(ano))
    for (const e of empresas) {
      if (faturamentos[e.db]) fd.set(`fat_${e.db}`, faturamentos[e.db])
      if (reunioes[e.db]) fd.set(`reu_${e.db}`, reunioes[e.db])
      if (contratos[e.db]) fd.set(`con_${e.db}`, contratos[e.db])
    }
    if (vinicius) fd.set("criativos_vinicius", vinicius)
    if (emanuel) fd.set("criativos_emanuel", emanuel)

    const r = await salvarDadosSemanaAction(fd)
    if (!r.ok) {
      setStatus(r.erro ?? "Erro")
      return
    }
    setStatus("Dados salvos ✓")
    setTimeout(() => router.push(`/dashboard?mes=${mes}&ano=${ano}`), 1800)
  }

  return (
    <div className="space-y-8">
      {/* SEÇÃO 1 — FATURAMENTO */}
      <Secao titulo="Faturamento" subtitulo="Bruno">
        <div className="space-y-3">
          {empresas
            .filter((e) => e.tipo !== "diego")
            .map((e) => {
              const valorExistente = e.existente?.faturamento_real ?? null
              const pct =
                valorExistente !== null && e.meta > 0
                  ? Math.min(100, Math.round((valorExistente / e.meta) * 100))
                  : 0
              return (
                <div
                  key={e.db}
                  className="glass"
                  style={{ padding: 16 }}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <div>
                      <p
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          color: "#fff",
                        }}
                      >
                        {e.nome}
                      </p>
                      <p
                        style={{
                          fontSize: 11,
                          color: "rgba(255,255,255,0.35)",
                          fontWeight: 300,
                        }}
                      >
                        {e.subtitulo}
                      </p>
                    </div>
                    <p
                      style={{
                        fontSize: 11,
                        color: "rgba(255,255,255,0.3)",
                        fontWeight: 400,
                      }}
                    >
                      Meta do mês: {formatBRL(e.meta)}
                    </p>
                  </div>

                  <div className="mt-3 flex items-center gap-3">
                    <input
                      type="number"
                      step="0.01"
                      placeholder={
                        valorExistente !== null
                          ? String(valorExistente)
                          : "R$ —"
                      }
                      value={faturamentos[e.db] ?? ""}
                      onChange={(ev) =>
                        setFaturamentos({
                          ...faturamentos,
                          [e.db]: ev.target.value,
                        })
                      }
                      className="glass-input"
                      style={{
                        flex: 1,
                        padding: "10px 14px",
                        fontSize: 14,
                      }}
                    />
                  </div>

                  <div className="mt-3">
                    <div
                      style={{
                        height: 2,
                        background: "rgba(255,255,255,0.06)",
                        borderRadius: 2,
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${pct}%`,
                          background: "#C9953A",
                        }}
                      />
                    </div>
                    <p
                      style={{
                        fontSize: 10,
                        color: "rgba(255,255,255,0.3)",
                        marginTop: 6,
                      }}
                    >
                      {valorExistente !== null
                        ? `${pct}% da meta atingida · último valor ${formatBRL(
                            valorExistente
                          )}`
                        : "Sem valor inserido neste mês"}
                    </p>
                  </div>
                </div>
              )
            })}
        </div>
      </Secao>

      {/* SEÇÃO 2 — REUNIÕES E CONTRATOS */}
      <Secao titulo="Reuniões e Contratos" subtitulo="Alisson">
        <div className="space-y-3">
          {empresas
            .filter(
              (e) =>
                e.tipo === "leads-reunioes-contratos" || e.tipo === "aton"
            )
            .map((e) => {
              const reuAcum = e.existente?.reunioes_real ?? 0
              const conAcum = e.existente?.contratos_real ?? 0
              return (
                <div
                  key={e.db}
                  className="glass"
                  style={{ padding: 16 }}
                >
                  <p
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: "#fff",
                    }}
                  >
                    {e.nome}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                    <LinhaIncremento
                      label={
                        e.tipo === "aton"
                          ? "Orçamentos esta semana"
                          : "Reuniões esta semana"
                      }
                      acumulado={reuAcum}
                      value={reunioes[e.db] ?? ""}
                      onChange={(v) =>
                        setReunioes({ ...reunioes, [e.db]: v })
                      }
                    />
                    <LinhaIncremento
                      label={
                        e.tipo === "aton"
                          ? "Vendas esta semana"
                          : "Contratos esta semana"
                      }
                      acumulado={conAcum}
                      value={contratos[e.db] ?? ""}
                      onChange={(v) =>
                        setContratos({ ...contratos, [e.db]: v })
                      }
                    />
                  </div>
                </div>
              )
            })}
        </div>
      </Secao>

      {/* SEÇÃO 3 — CRIATIVOS */}
      <Secao titulo="Criativos aprovados" subtitulo="Vinicius e Emanuel">
        <div className="glass" style={{ padding: 16 }}>
          <BlocoCriativo
            nome="Vinicius — criativos aprovados esta semana"
            acumulado={acumuladoVinicius}
            value={vinicius}
            onChange={setVinicius}
            bonus={bonusVinicius}
          />
          <div
            className="divider-h"
            style={{ margin: "16px -16px" }}
          />
          <BlocoCriativo
            nome="Emanuel — criativos aprovados esta semana"
            acumulado={acumuladoEmanuel}
            value={emanuel}
            onChange={setEmanuel}
            bonus={bonusEmanuel}
          />
        </div>
      </Secao>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          onClick={() => startTransition(() => salvar())}
          disabled={pending}
          className="btn-gold-filled uppercase"
          style={{ opacity: pending ? 0.5 : 1, fontSize: 12, padding: "12px 24px" }}
        >
          {pending ? "Salvando..." : "Salvar dados da semana"}
        </button>
        {status && (
          <span
            style={{
              fontSize: 12,
              color: status.includes("✓") ? "#4caf50" : "#e24b4a",
            }}
          >
            {status}
          </span>
        )}
      </div>
    </div>
  )
}

function Secao({
  titulo,
  subtitulo,
  children,
}: {
  titulo: string
  subtitulo: string
  children: React.ReactNode
}) {
  return (
    <section>
      <div className="flex items-baseline justify-between mb-3">
        <h2
          style={{
            fontSize: 18,
            fontWeight: 600,
            color: "#fff",
            letterSpacing: "-0.3px",
          }}
        >
          {titulo}
        </h2>
        <span
          style={{
            fontSize: 10,
            letterSpacing: "1.5px",
            textTransform: "uppercase",
            color: "#C9953A",
            fontWeight: 500,
          }}
        >
          {subtitulo}
        </span>
      </div>
      {children}
    </section>
  )
}

function LinhaIncremento({
  label,
  acumulado,
  value,
  onChange,
}: {
  label: string
  acumulado: number
  value: string
  onChange: (v: string) => void
}) {
  return (
    <label className="block">
      <span
        style={{
          fontSize: 11,
          color: "rgba(255,255,255,0.5)",
          fontWeight: 400,
        }}
      >
        {label}{" "}
        <span
          style={{
            fontSize: 10,
            color: "rgba(255,255,255,0.3)",
          }}
        >
          (acumulado: {acumulado})
        </span>
      </span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
        className="glass-input"
        style={{
          marginTop: 6,
          width: "100%",
          padding: "8px 12px",
          fontSize: 14,
        }}
      />
    </label>
  )
}

function BlocoCriativo({
  nome,
  acumulado,
  value,
  onChange,
  bonus,
}: {
  nome: string
  acumulado: number
  value: string
  onChange: (v: string) => void
  bonus: number
}) {
  const novo = Number(value) || 0
  const total = acumulado + novo
  return (
    <div>
      <label className="block">
        <span
          style={{
            fontSize: 12,
            color: "rgba(255,255,255,0.7)",
            fontWeight: 400,
          }}
        >
          {nome}
        </span>
        <div className="flex items-center gap-3 mt-2">
          <input
            type="number"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="0"
            className="glass-input"
            style={{
              flex: 1,
              padding: "8px 12px",
              fontSize: 14,
            }}
          />
          <span
            style={{
              fontSize: 11,
              color: "rgba(255,255,255,0.4)",
              whiteSpace: "nowrap",
            }}
          >
            Acumulado do mês: {total}
          </span>
        </div>
      </label>
      <p
        style={{
          fontSize: 11,
          color: "rgba(255,255,255,0.4)",
          marginTop: 6,
        }}
      >
        Bônus estimado:{" "}
        <span style={{ color: "#C9953A", fontWeight: 500 }}>
          {formatBRL(bonus)}
        </span>
      </p>
    </div>
  )
}
