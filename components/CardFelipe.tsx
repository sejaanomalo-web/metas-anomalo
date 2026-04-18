"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  GATILHOS_FELIPE,
  calcularBonusFelipe,
} from "@/lib/comissionamento"
import { salvarComissaoAction } from "@/lib/comissionamento-actions"
import type { Comissionamento } from "@/lib/supabase"
import type { Ano, Mes } from "@/lib/data"
import { formatBRL } from "@/lib/data"

export default function CardFelipe({
  mes,
  ano,
  existente,
  supabaseOk,
}: {
  mes: Mes
  ano: Ano
  existente: Comissionamento | null
  supabaseOk: boolean
}) {
  const flagsIniciais: Record<string, boolean> = {}
  for (const g of GATILHOS_FELIPE) {
    flagsIniciais[g.chave] = Boolean(existente?.gatilhos_atingidos?.[g.chave])
  }

  const [aberto, setAberto] = useState(false)
  const [flags, setFlags] = useState<Record<string, boolean>>(flagsIniciais)
  const [observacoes, setObservacoes] = useState(existente?.observacoes ?? "")
  const [pending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const router = useRouter()

  const bonusPreview = calcularBonusFelipe(flags)
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
            Felipe
          </h3>
          <p
            style={{
              fontSize: 12,
              color: "#666",
              fontWeight: 400,
              marginTop: 4,
            }}
          >
            Tráfego e Postagens
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

      <div style={{ marginTop: 16 }}>
        {GATILHOS_FELIPE.map((g) => {
          const atingido = existente?.gatilhos_atingidos?.[g.chave]
          return (
            <div
              key={g.chave}
              className="flex items-center justify-between py-2"
            >
              <span
                style={{ fontSize: 13, color: "#888", fontWeight: 400 }}
              >
                {g.rotulo}
              </span>
              <div className="flex items-center gap-3">
                <span
                  style={{
                    fontSize: 11,
                    color: atingido ? "#4caf50" : "#555",
                    fontWeight: 400,
                  }}
                >
                  {atingido ? "atingido" : "pendente"}
                </span>
                <span
                  style={{
                    fontSize: 13,
                    color: atingido ? "#C9953A" : "#444",
                    fontWeight: 400,
                  }}
                >
                  {formatBRL(g.valor)}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      <div
        className="divider-h"
        style={{ marginTop: 16, marginLeft: -24, marginRight: -24 }}
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
                    Comissão · Felipe
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
              <input type="hidden" name="colaborador" value="felipe" />
              <input type="hidden" name="mes" value={mes} />
              <input type="hidden" name="ano" value={ano} />

              <div className="space-y-3">
                {GATILHOS_FELIPE.map((g) => (
                  <label
                    key={g.chave}
                    className="flex items-center justify-between gap-3 cursor-pointer"
                    style={{
                      padding: "14px 16px",
                      border: `0.5px solid ${
                        flags[g.chave] ? "#2a4a2a" : "#1e1e1e"
                      }`,
                      background: flags[g.chave] ? "#0e1410" : "#111",
                      borderRadius: 4,
                    }}
                  >
                    <div>
                      <p style={{ fontSize: 13, color: "#fff", fontWeight: 400 }}>
                        {g.rotulo}
                      </p>
                      <p
                        style={{
                          fontSize: 12,
                          color: "#C9953A",
                          fontWeight: 400,
                          marginTop: 2,
                        }}
                      >
                        {formatBRL(g.valor)}
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      name={g.chave}
                      checked={flags[g.chave]}
                      onChange={(e) =>
                        setFlags({ ...flags, [g.chave]: e.target.checked })
                      }
                      style={{
                        width: 18,
                        height: 18,
                        accentColor: "#C9953A",
                      }}
                    />
                  </label>
                ))}

                <label className="block" style={{ marginTop: 8 }}>
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
                  className="flex items-baseline justify-between"
                  style={{
                    marginTop: 12,
                    padding: "14px 0",
                    borderTop: "0.5px solid #141414",
                  }}
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
