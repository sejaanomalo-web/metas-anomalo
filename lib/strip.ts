import type { DadosReais } from "./supabase"
import {
  type Ano,
  type Mes,
  type ResumoGrupo,
  anoTemProjecao,
  corStatusMeta,
  formatBRL,
  formatNumero,
} from "./data"

interface Celula {
  rotulo: string
  valor: string
  cor?: string
  metaDisplay?: string
  corMeta?: string
  hint?: string
}

export function montarCelulasGrupo(
  resumo: ResumoGrupo,
  reaisDoMes: Map<string, DadosReais>,
  mes: Mes,
  ano: Ano
): Celula[] {
  const temProjecao = anoTemProjecao(ano)

  let somaFaturamento = 0
  let somaInvestimento = 0
  let somaLeads = 0
  let somaCriativos = 0
  let temFat = false
  let temInv = false
  let temLeads = false
  let temCri = false

  for (const d of reaisDoMes.values()) {
    if (d.faturamento_real !== null) {
      somaFaturamento += d.faturamento_real
      temFat = true
    }
    if (d.investimento_real !== null) {
      somaInvestimento += d.investimento_real
      temInv = true
    }
    if (d.leads_real !== null) {
      somaLeads += d.leads_real
      temLeads = true
    }
    if (d.criativos_entregues !== null) {
      somaCriativos += d.criativos_entregues
      temCri = true
    }
  }

  function celula(
    rotulo: string,
    real: number,
    temReal: boolean,
    meta: number,
    tipo: "moeda" | "numero",
    hint?: string
  ): Celula {
    const valorFormatado = temReal
      ? tipo === "moeda"
        ? formatBRL(real)
        : formatNumero(real)
      : "—"
    const metaFormatada =
      tipo === "moeda" ? formatBRL(meta) : formatNumero(meta)
    const cor = temProjecao
      ? corStatusMeta(real, meta, temReal, mes, ano)
      : temReal
      ? "#fff"
      : "#333"
    return {
      rotulo,
      valor: valorFormatado,
      cor,
      metaDisplay: temProjecao ? `Meta ${metaFormatada}` : undefined,
      corMeta: temProjecao ? cor : undefined,
      hint,
    }
  }

  return [
    celula(
      "Faturamento do grupo",
      somaFaturamento,
      temFat,
      resumo.faturamento,
      "moeda"
    ),
    celula(
      "Total investido em ads",
      somaInvestimento,
      temInv,
      resumo.investimento,
      "moeda"
    ),
    celula("Total de leads", somaLeads, temLeads, resumo.leads, "numero"),
    celula(
      "Criativos do mês",
      somaCriativos,
      temCri,
      resumo.criativos,
      "numero",
      temProjecao
        ? `${resumo.criativosSemana} por semana · grupo`
        : undefined
    ),
  ]
}
