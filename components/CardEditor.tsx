"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { salvarComissaoAction } from "@/lib/comissionamento-actions"
import {
  calcularBonusEmanuel,
  calcularBonusVinicius,
} from "@/lib/comissionamento"
import type { Comissionamento } from "@/lib/supabase"
import type { Ano, Mes } from "@/lib/data"
import { formatBRL } from "@/lib/data"

interface Faixa {
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
  ano: Ano
  existente: Comissionamento | null
  supabaseOk: boolean
}) {
  const [aberto, setAberto] = useState(false)
  const [entregas, setEntregas] = useState<number>(
    existente?.entregas_validas ?? 0
  )
  const [descontadas, setDescontadas] = useState<number>(
    existente?.entregas_descontadas ?? 0
  )
  const [observacoes, setObservacoes] = useState(existente?.observacoes ?? "")
  const [pending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const router = useRouter()

  const calcular =
    colaborador === "vinicius" ? calcularBonusVinicius : calcularBonusEmanuel
  const liquidas = Math.max(0, entregas - descontadas)
  const bonusPreview = calcular(liquidas)
  const bonusSalvo = existente?.bonus_calculado ?? 0

  async function onSubmit(fd: FormData) {
    setErro(null)
    const r = await salvarComissaoAction(fd)
    if (!r.ok) {
      setErro(r.erro ?? "Erro desconhecido.")
      return
    }
    setAberto(false)
    router.refresh()
  }

  return (
    <div
      style={{
        background: "#0c0c0c",
        border: "0.5px solid #141414",
        borderRadius: 10,
        padding: "24px 24px 8px",
      }}
    >
      <div className="flex items-start justify-between">
        <div>
          <h3
            style={{
              fontSize: 16,
              color: "#fff",
              fontWeight: 500,
            }}
          >
            {nome}
          </h3>
          <p
            style={{
              fontSize: 12,
              color: "#666",
              fontWeight: 400,
              marginTop: 4,
            }}
          >
            {funcao}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAberto(true)}
          style={{
            background: "transparent",
            border: "0.5px solid #C9953A",
            color: "#C9953A",
            fontSize: 11,
            padding: "6px 12px",
            borderRadius: 4,
            fontWeight: 400,
          }}
          className="hover:bg-[#C9953A] hover:text-[#080808] transition"
        >
          Editar dados reais
        </button>
      </div>

      <div
        className="divider-h"
        style={{ marginTop: 20, marginLeft: -24, marginRight: -24 }}
      />

      <div style={{ marginTop: 16, marginBottom: 16 }}>
        {faixas.map((f) => {
          const ativa = bonusSalvo === f.valor && f.valor > 0
          return (
            <div
              key={f.rotulo}
              className="flex items-center justify-between py-2"
            >
              <span
                style={{
                  fontSize: 13,
                  color: ativa ? "#C9953A" : "#888",
                  fontWeight: 400,
                }}
              >
                {f.rotulo}
              </span>
              <span
                style={{
                  fontSize: 13,
                  color: ativa ? "#C9953A" : "#444",
                  fontWeight: 400,
                }}
              >
                {formatBRL(f.valor)}
              </span>
            </div>
          )
        })}
      </div>

      <div style={{ marginBottom: 12 }}>
        <p style={{ fontSize: 12, color: "#666", fontWeight: 400 }}>
          Entregas válidas:{" "}
          <span style={{ color: "#fff" }}>
            {existente?.entregas_validas ?? 0}
          </span>
        </p>
        {(existente?.entregas_descontadas ?? 0) > 0 && (
          <p
            style={{
              fontSize: 12,
              color: "#666",
              fontWeight: 400,
              marginTop: 4,
            }}
          >
            Descontadas:{" "}
            <span style={{ color: "#e24b4a" }}>
              −{existente?.entregas_descontadas}
            </span>
          </p>
        )}
      </div>

      <div
        className="divider-h"
        style={{ marginLeft: -24, marginRight: -24 }}
      />

      <div
        className="flex items-baseline justify-between"
        style={{ padding: "20px 0" }}
      >
        <span
          style={{
            fontSize: 11,
            letterSpacing: "1px",
            color: "#666",
            textTransform: "uppercase",
            fontWeight: 400,
          }}
        >
          Bônus total
        </span>
        <span
          style={{
            fontSize: 22,
            color: "#C9953A",
            fontWeight: 500,
          }}
        >
          {formatBRL(bonusSalvo)}
        </span>
      </div>

      {existente?.observacoes && (
        <p
          style={{
            fontSize: 12,
            color: "#666",
            fontWeight: 400,
            paddingBottom: 16,
            whiteSpace: "pre-wrap",
          }}
        >
          {existente.observacoes}
        </p>
      )}

      {aberto && (
        <div className="fixed inset-0 z-40">
          <button
            type="button"
            aria-label="Fechar"
            onClick={() => setAberto(false)}
            className="absolute inset-0"
            style={{ background: "rgba(0,0,0,0.7)" }}
          />

          <aside
            className="absolute right-0 top-0 h-full overflow-y-auto"
            style={{
              width: 400,
              background: "#0c0c0c",
              borderLeft: "0.5px solid #1e1e1e",
            }}
          >
            <div
              className="sticky top-0"
              style={{
                background: "rgba(12,12,12,0.95)",
                backdropFilter: "blur(6px)",
                borderBottom: "0.5px solid #141414",
                padding: "20px 24px",
              }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p
                    style={{
                      fontSize: 11,
                      letterSpacing: "1px",
                      color: "#666",
                      textTransform: "uppercase",
                      fontWeight: 400,
                    }}
                  >
                    {mes} · {ano}
                  </p>
                  <p
                    style={{
                      fontSize: 16,
                      color: "#fff",
                      fontWeight: 500,
                      marginTop: 6,
                    }}
                  >
                    Comissão · {nome}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAberto(false)}
                  style={{ color: "#666", fontSize: 22, lineHeight: 1 }}
                  className="hover:text-[#fff] transition"
                >
                  ×
                </button>
              </div>
            </div>

            <form
              action={(fd) => startTransition(() => onSubmit(fd))}
              style={{ padding: 24 }}
            >
              <input type="hidden" name="colaborador" value={colaborador} />
              <input type="hidden" name="mes" value={mes} />
              <input type="hidden" name="ano" value={ano} />

              <div className="space-y-4">
                <CampoNumero
                  label="Entregas válidas no mês"
                  name="entregas_validas"
                  value={entregas}
                  onChange={setEntregas}
                />
                <CampoNumero
                  label="Entregas descontadas (fora do prazo ou 3+ revisões)"
                  name="entregas_descontadas"
                  value={descontadas}
                  onChange={setDescontadas}
                />

                <label className="block">
                  <span
                    style={{
                      fontSize: 11,
                      letterSpacing: "0.5px",
                      color: "#666",
                      textTransform: "uppercase",
                      fontWeight: 400,
                    }}
                  >
                    Observações
                  </span>
                  <textarea
                    name="observacoes"
                    rows={3}
                    value={observacoes}
                    onChange={(e) => setObservacoes(e.target.value)}
                    style={{
                      marginTop: 8,
                      width: "100%",
                      background: "#111",
                      border: "0.5px solid #1e1e1e",
                      color: "#ccc",
                      fontSize: 14,
                      padding: "10px 14px",
                      borderRadius: 4,
                      outline: "none",
                      fontWeight: 400,
                    }}
                    placeholder="..."
                  />
                </label>

                <div
                  style={{
                    padding: "14px 0",
                    borderTop: "0.5px solid #141414",
                  }}
                >
                  <div className="flex items-baseline justify-between">
                    <span
                      style={{
                        fontSize: 11,
                        letterSpacing: "1px",
                        color: "#666",
                        textTransform: "uppercase",
                        fontWeight: 400,
                      }}
                    >
                      Líquidas
                    </span>
                    <span
                      style={{
                        fontSize: 14,
                        color: "#fff",
                        fontWeight: 400,
                      }}
                    >
                      {liquidas}
                    </span>
                  </div>
                  <div
                    className="flex items-baseline justify-between"
                    style={{ marginTop: 10 }}
                  >
                    <span
                      style={{
                        fontSize: 11,
                        letterSpacing: "1px",
                        color: "#666",
                        textTransform: "uppercase",
                        fontWeight: 400,
                      }}
                    >
                      Prévia do bônus
                    </span>
                    <span
                      style={{
                        fontSize: 20,
                        color: "#C9953A",
                        fontWeight: 500,
                      }}
                    >
                      {formatBRL(bonusPreview)}
                    </span>
                  </div>
                </div>

                {erro && (
                  <p style={{ color: "#e24b4a", fontSize: 12 }}>{erro}</p>
                )}

                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={pending || !supabaseOk}
                    style={{
                      flex: 1,
                      background: "#C9953A",
                      color: "#080808",
                      padding: "10px 0",
                      fontSize: 13,
                      fontWeight: 500,
                      borderRadius: 4,
                      opacity: pending || !supabaseOk ? 0.5 : 1,
                    }}
                    className="hover:brightness-110 transition"
                  >
                    {pending ? "Salvando..." : "Salvar"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAberto(false)}
                    style={{
                      background: "transparent",
                      border: "0.5px solid #1e1e1e",
                      color: "#666",
                      padding: "10px 16px",
                      fontSize: 13,
                      borderRadius: 4,
                      fontWeight: 400,
                    }}
                    className="hover:text-[#fff] transition"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </form>
          </aside>
        </div>
      )}
    </div>
  )
}

function CampoNumero({
  label,
  name,
  value,
  onChange,
}: {
  label: string
  name: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <label className="block">
      <span
        style={{
          fontSize: 11,
          letterSpacing: "0.5px",
          color: "#666",
          textTransform: "uppercase",
          fontWeight: 400,
        }}
      >
        {label}
      </span>
      <input
        type="number"
        name={name}
        min={0}
        value={value}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
        style={{
          marginTop: 8,
          width: "100%",
          background: "#111",
          border: "0.5px solid #1e1e1e",
          color: "#ccc",
          fontSize: 14,
          padding: "10px 14px",
          borderRadius: 4,
          outline: "none",
          fontWeight: 400,
        }}
      />
    </label>
  )
}
