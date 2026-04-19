"use client"

import { useState } from "react"
import type { DadosReais } from "@/lib/supabase"
import { type Mes, formatBRL, formatNumero } from "@/lib/data"

interface Coluna {
  chave: string
  titulo: string
  tipo?: "numero" | "brl" | "percent" | "texto"
}

type Modo = "meta" | "cenario"

// Cor de fundo do card — mesma aparência da glass sobre fundo preto
const STICKY_BG = "#0b0b0b"

// Mapeia chave da coluna de meta para o campo equivalente em dados_reais.
// Colunas sem equivalente ficam vazias no modo Cenário.
const CHAVE_TO_REAL: Record<string, keyof DadosReais> = {
  verba: "investimento_real",
  leads: "leads_real",
  reunioes: "reunioes_real",
  orcamentos: "reunioes_real",
  contratos: "contratos_real",
  vendas: "contratos_real",
  faturamento: "faturamento_real",
  receita: "faturamento_real",
  receita_hub: "faturamento_real",
  criativos: "criativos_entregues",
}

export default function TabelaMeses({
  colunas,
  linhas,
  reais,
  mesAtual,
  acao,
}: {
  colunas: Coluna[]
  linhas: Record<string, string | number>[]
  reais?: Map<string, DadosReais>
  mesAtual?: Mes
  acao?: React.ReactNode
}) {
  const [modo, setModo] = useState<Modo>("meta")

  function valorCelula(
    linha: Record<string, string | number>,
    coluna: Coluna
  ): { conteudo: string; ehFat: boolean } {
    const ehFat =
      coluna.chave === "faturamento" ||
      coluna.chave === "receita" ||
      coluna.chave === "receita_hub"

    if (coluna.chave === "mes") {
      const v = linha[coluna.chave]
      return { conteudo: String(v ?? ""), ehFat: false }
    }

    if (modo === "cenario") {
      const mes = String(linha.mes ?? "")
      const real = reais?.get(mes)
      const campoReal = CHAVE_TO_REAL[coluna.chave]
      if (!real || !campoReal) return { conteudo: "", ehFat }
      const v = real[campoReal]
      if (v === null || v === undefined) return { conteudo: "", ehFat }
      if (typeof v === "number") {
        if (coluna.tipo === "brl") return { conteudo: formatBRL(v), ehFat }
        if (coluna.tipo === "percent")
          return { conteudo: `${v}%`, ehFat }
        return { conteudo: formatNumero(v), ehFat }
      }
      return { conteudo: String(v), ehFat }
    }

    const v = linha[coluna.chave]
    let conteudo: string = String(v ?? "—")
    if (typeof v === "number") {
      if (coluna.tipo === "brl") conteudo = formatBRL(v)
      else if (coluna.tipo === "percent") conteudo = `${v}%`
      else conteudo = formatNumero(v)
    }
    return { conteudo, ehFat }
  }

  return (
    <div className="glass" style={{ padding: 24 }}>
      <div
        className="flex items-center justify-between"
        style={{ marginBottom: 16 }}
      >
        <p
          style={{
            fontSize: 9,
            letterSpacing: "2px",
            color: "rgba(255,255,255,0.35)",
            textTransform: "uppercase",
            fontWeight: 500,
          }}
        >
          Detalhamento Mensal
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <BotaoModo
              ativo={modo === "meta"}
              onClick={() => setModo("meta")}
              label="Meta"
            />
            <BotaoModo
              ativo={modo === "cenario"}
              onClick={() => setModo("cenario")}
              label="Cenário"
            />
          </div>
          {acao}
        </div>
      </div>

      <div
        className="overflow-x-auto scrollbar-thin"
        style={{ position: "relative" }}
      >
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            minWidth: "max-content",
          }}
        >
          <thead>
            <tr>
              {colunas.map((c, idx) => {
                const eMes = idx === 0
                return (
                  <th
                    key={c.chave}
                    style={{
                      fontSize: 9,
                      letterSpacing: "2px",
                      color: "rgba(255,255,255,0.3)",
                      textTransform: "uppercase",
                      fontWeight: 500,
                      textAlign: "left",
                      padding: "12px 14px",
                      borderBottom: "0.5px solid rgba(255,255,255,0.05)",
                      whiteSpace: "nowrap",
                      ...(eMes
                        ? {
                            position: "sticky",
                            left: 0,
                            zIndex: 3,
                            background: STICKY_BG,
                            borderRight:
                              "0.5px solid rgba(255,255,255,0.06)",
                          }
                        : null),
                    }}
                  >
                    {c.titulo}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {linhas.map((linha, i) => {
              const destacado =
                mesAtual !== undefined && linha.mes === mesAtual
              const rowBg = destacado ? "rgba(201,149,58,0.03)" : "transparent"
              return (
                <tr key={i} style={{ background: rowBg }}>
                  {colunas.map((c, idx) => {
                    const { conteudo, ehFat } = valorCelula(linha, c)
                    const eMes = idx === 0
                    return (
                      <td
                        key={c.chave}
                        style={{
                          fontSize: 13,
                          color: ehFat ? "#C9953A" : "rgba(255,255,255,0.7)",
                          fontWeight: ehFat ? 500 : 400,
                          padding: "12px 14px",
                          borderBottom:
                            "0.5px solid rgba(255,255,255,0.04)",
                          whiteSpace: "nowrap",
                          ...(eMes
                            ? {
                                position: "sticky",
                                left: 0,
                                zIndex: 2,
                                background: destacado
                                  ? STICKY_BG
                                  : STICKY_BG,
                                borderRight:
                                  "0.5px solid rgba(255,255,255,0.06)",
                              }
                            : null),
                        }}
                      >
                        {conteudo}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function BotaoModo({
  ativo,
  onClick,
  label,
}: {
  ativo: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "5px 12px",
        borderRadius: 999,
        fontSize: 10,
        fontWeight: 500,
        letterSpacing: "0.3px",
        background: ativo ? "rgba(201,149,58,0.15)" : "transparent",
        border: `0.5px solid ${
          ativo ? "#C9953A" : "rgba(255,255,255,0.1)"
        }`,
        color: ativo ? "#C9953A" : "rgba(255,255,255,0.35)",
        transition: "background 0.15s ease, color 0.15s ease",
      }}
    >
      {label}
    </button>
  )
}
