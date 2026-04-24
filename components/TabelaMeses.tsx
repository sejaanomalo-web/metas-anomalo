"use client"

import { useState } from "react"
import type { DadosReais } from "@/lib/supabase"
import type { DiaDetalhado } from "@/lib/dados-diarios"
import {
  ORIGEM_PADRAO,
  type Mes,
  type OrigemDadosReais,
  formatBRL,
  formatNumero,
} from "@/lib/data"

interface Coluna {
  chave: string
  titulo: string
  tipo?: "numero" | "brl" | "percent" | "texto"
}

type Modo = "meta" | "cenario"
type ResumoCenario = "mensal" | "diario"

// Cor de fundo do card — mesma aparência da glass sobre fundo preto
const STICKY_BG = "#0b0b0b"

// Colunas que só fazem sentido quando origem = pago. No modo orgânico
// elas somem da tabela.
const COLUNAS_APENAS_PAGO = new Set(["verba", "criativos"])

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

// Mapeia chave da coluna para campo do delta diário (DiaDetalhado).
// Só as colunas com correspondência aparecem no modo Diário.
const CHAVE_TO_DIARIO: Record<string, keyof DiaDetalhado> = {
  verba: "investimento",
  leads: "leads",
  reunioes: "reunioes",
  orcamentos: "reunioes",
  contratos: "contratos",
  vendas: "contratos",
  faturamento: "faturamento",
  receita: "faturamento",
  receita_hub: "faturamento",
  criativos: "criativos",
}

export default function TabelaMeses({
  colunas,
  linhas,
  reais,
  mesAtual,
  origem = ORIGEM_PADRAO,
  dadosDiarios,
  acao,
}: {
  colunas: Coluna[]
  linhas: Record<string, string | number>[]
  reais?: Map<string, DadosReais>
  mesAtual?: Mes
  origem?: OrigemDadosReais
  dadosDiarios?: DiaDetalhado[]
  acao?: React.ReactNode
}) {
  const [modo, setModo] = useState<Modo>("meta")
  const [resumo, setResumo] = useState<ResumoCenario>("mensal")
  const temDiarios = Array.isArray(dadosDiarios) && dadosDiarios.length > 0
  const modoDiario = modo === "cenario" && resumo === "diario" && temDiarios

  const colunasVisiveis = (() => {
    const filtradas =
      origem === "organico"
        ? colunas.filter((c) => !COLUNAS_APENAS_PAGO.has(c.chave))
        : colunas
    if (!modoDiario) return filtradas
    // No modo diário, só primeira coluna + colunas com mapping em
    // CHAVE_TO_DIARIO. A primeira vira "Dia".
    const out: Coluna[] = []
    for (const [idx, c] of filtradas.entries()) {
      if (idx === 0) {
        out.push({ chave: "__dia", titulo: "Dia" })
        continue
      }
      if (c.chave in CHAVE_TO_DIARIO) out.push(c)
    }
    return out
  })()

  const linhasRender: Record<string, string | number>[] = modoDiario
    ? (dadosDiarios ?? []).map((d) => ({
        __dia: String(d.diaMes).padStart(2, "0"),
        verba: d.investimento,
        leads: d.leads,
        reunioes: d.reunioes,
        orcamentos: d.reunioes,
        contratos: d.contratos,
        vendas: d.contratos,
        faturamento: d.faturamento,
        receita: d.faturamento,
        receita_hub: d.faturamento,
        criativos: d.criativos,
      }))
    : linhas

  function valorCelula(
    linha: Record<string, string | number>,
    coluna: Coluna
  ): { conteudo: string; ehFat: boolean } {
    const ehFat =
      coluna.chave === "faturamento" ||
      coluna.chave === "receita" ||
      coluna.chave === "receita_hub"

    if (coluna.chave === "__dia") {
      const v = linha.__dia
      return { conteudo: String(v ?? ""), ehFat: false }
    }

    if (coluna.chave === "mes") {
      const v = linha[coluna.chave]
      return { conteudo: String(v ?? ""), ehFat: false }
    }

    if (modoDiario) {
      const v = linha[coluna.chave]
      if (typeof v !== "number" || v === 0) {
        return { conteudo: "—", ehFat }
      }
      if (coluna.tipo === "brl") return { conteudo: formatBRL(v), ehFat }
      return { conteudo: formatNumero(v), ehFat }
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
        className="flex items-center justify-between flex-wrap gap-3"
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
          {modoDiario
            ? `Detalhamento Diário · ${mesAtual ?? ""}`
            : "Detalhamento Mensal"}
        </p>
        <div className="flex items-center gap-1.5 flex-nowrap flex-wrap">
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
          {modo === "cenario" && temDiarios && (
            <span
              style={{
                display: "inline-flex",
                gap: 2,
                marginLeft: 6,
                padding: 2,
                borderRadius: 999,
                border: "0.5px solid rgba(255,255,255,0.08)",
                background: "rgba(255,255,255,0.02)",
              }}
            >
              <SubBotao
                ativo={resumo === "mensal"}
                onClick={() => setResumo("mensal")}
                label="Mensal"
              />
              <SubBotao
                ativo={resumo === "diario"}
                onClick={() => setResumo("diario")}
                label="Diário"
              />
            </span>
          )}
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
              {colunasVisiveis.map((c, idx) => {
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
            {linhasRender.map((linha, i) => {
              const destacado =
                !modoDiario &&
                mesAtual !== undefined &&
                linha.mes === mesAtual
              const rowBg = destacado ? "rgba(201,149,58,0.03)" : "transparent"
              return (
                <tr key={i} style={{ background: rowBg }}>
                  {colunasVisiveis.map((c, idx) => {
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
            {modoDiario && linhasRender.length > 0 && (() => {
              const totais: Record<string, number> = {}
              for (const l of linhasRender) {
                for (const c of colunasVisiveis) {
                  if (c.chave === "__dia") continue
                  const v = l[c.chave]
                  if (typeof v === "number") {
                    totais[c.chave] = (totais[c.chave] ?? 0) + v
                  }
                }
              }
              return (
                <tr
                  style={{
                    background: "rgba(201,149,58,0.04)",
                  }}
                >
                  {colunasVisiveis.map((c, idx) => {
                    const eMes = idx === 0
                    const ehFat =
                      c.chave === "faturamento" ||
                      c.chave === "receita" ||
                      c.chave === "receita_hub"
                    const v = totais[c.chave]
                    const conteudo =
                      c.chave === "__dia"
                        ? "Total do mês"
                        : typeof v === "number"
                        ? c.tipo === "brl"
                          ? formatBRL(v)
                          : formatNumero(v)
                        : ""
                    return (
                      <td
                        key={c.chave}
                        style={{
                          fontSize: 12,
                          color: ehFat ? "#C9953A" : "rgba(255,255,255,0.75)",
                          fontWeight: 600,
                          padding: "14px 14px",
                          borderTop: "0.5px solid rgba(201,149,58,0.25)",
                          whiteSpace: "nowrap",
                          textTransform: eMes ? "uppercase" : undefined,
                          letterSpacing: eMes ? "1px" : undefined,
                          ...(eMes
                            ? {
                                position: "sticky",
                                left: 0,
                                zIndex: 2,
                                background: "rgba(201,149,58,0.05)",
                                borderRight:
                                  "0.5px solid rgba(255,255,255,0.06)",
                                fontSize: 9,
                                color: "rgba(201,149,58,0.8)",
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
            })()}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SubBotao({
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
        padding: "4px 10px",
        borderRadius: 999,
        fontSize: 9,
        fontWeight: 600,
        letterSpacing: "1.2px",
        textTransform: "uppercase",
        background: ativo ? "rgba(201,149,58,0.18)" : "transparent",
        color: ativo ? "#C9953A" : "rgba(255,255,255,0.45)",
        border: `0.5px solid ${
          ativo ? "rgba(201,149,58,0.4)" : "transparent"
        }`,
      }}
    >
      {label}
    </button>
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
