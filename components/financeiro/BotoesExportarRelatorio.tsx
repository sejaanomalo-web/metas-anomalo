"use client"

import type { DREMes, PontoFluxoMensal } from "@/lib/financeiro"
import { rotuloMes } from "@/lib/financeiro-regras"
import type { Mes } from "@/lib/data"

interface ProjecaoPonto {
  mes: number
  rotulo: string
  receitas: number
  despesas: number
  resultado: number
}

interface Props {
  dre: DREMes
  fluxo: PontoFluxoMensal[]
  projecao: ProjecaoPonto[]
  mes: Mes
  ano: number
  /** Rótulo do período selecionado (ex.: "Junho 2026", "10 jun", "10 mai – 20 jun").
   *  O DRE reflete esse período; sem ele, cai no mês representativo. */
  rotulo?: string
}

/** Slug seguro p/ nome de arquivo a partir do rótulo do período. */
function slugRotulo(rotulo: string): string {
  return rotulo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/**
 * Botões de exportação do relatório financeiro:
 *
 *  - CSV: gera string CSV com BOM UTF-8 (Excel/Numbers lê acentos),
 *    monta 3 seções (DRE, Projeção, Histórico do ano) e dispara
 *    download via Blob + anchor. Zero dependência.
 *
 *  - PDF: usa window.print(). O navegador abre o diálogo nativo de
 *    impressão; o usuário escolhe "Salvar como PDF" no destino.
 *    O layout é controlado por @media print no globals.css —
 *    esconde sidebar, nav superior e botões; o conteúdo do
 *    relatório é otimizado pra A4 retrato.
 */
export default function BotoesExportarRelatorio({
  dre,
  fluxo,
  projecao,
  mes,
  ano,
  rotulo,
}: Props) {
  // Rótulo do período pra cabeçalhos do CSV/arquivo. Em modo 'mes' o
  // rotulo já é "<Mês> <Ano>"; em dia/intervalo reflete o range real.
  const periodoLabel = rotulo ?? `${mes}/${ano}`
  const periodoSlug = rotulo ? slugRotulo(rotulo) : `${mes.toLowerCase()}-${ano}`

  function exportarCSV() {
    const csv = montarCSV(dre, fluxo, projecao, periodoLabel, ano)
    // BOM UTF-8 — sem ele, Excel mostra "Mãe" como "MÃ£e".
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `relatorio-financeiro-${periodoSlug}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  function exportarPDF() {
    window.print()
  }

  return (
    <div
      className="no-print"
      style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
    >
      <button
        type="button"
        onClick={exportarCSV}
        className="btn-gold-outline"
        title="Baixa um .csv (abre no Excel, Google Sheets, Numbers)"
      >
        <span style={{ marginRight: 6 }}>📊</span>
        Exportar planilha
      </button>
      <button
        type="button"
        onClick={exportarPDF}
        className="btn-gold-filled"
        title='Abre o diálogo de impressão. Escolha "Salvar como PDF" no destino.'
      >
        <span style={{ marginRight: 6 }}>📄</span>
        Exportar PDF
      </button>
    </div>
  )
}

/**
 * Separador do CSV.
 *
 * `;` e não `,`: no Excel configurado em português, a vírgula é o separador
 * DECIMAL, então um arquivo separado por vírgula abre com tudo espremido numa
 * coluna só. O `;` é o que o Excel pt-BR espera — e é por isso que os valores
 * abaixo saem com vírgula decimal sem causar ambiguidade.
 */
const SEP = ";"

function csvCampo(v: string | number): string {
  const s = String(v)
  if (s.includes(SEP) || s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function linhaCSV(...campos: (string | number)[]): string {
  return campos.map(csvCampo).join(SEP)
}

/** Valor com vírgula decimal, como o Excel pt-BR espera. */
function csvValor(n: number): string {
  return n.toFixed(2).replace(".", ",")
}

function montarCSV(
  dre: DREMes,
  fluxo: PontoFluxoMensal[],
  projecao: ProjecaoPonto[],
  periodoLabel: string,
  ano: number
): string {
  const linhas: string[] = []

  // Cabeçalho geral
  linhas.push(linhaCSV("Relatório financeiro · Anômalo Hub"))
  linhas.push(linhaCSV(`Período de referência: ${periodoLabel}`))
  linhas.push(
    linhaCSV(
      `Gerado em: ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`
    )
  )
  linhas.push("")

  // === DRE Receitas ===
  linhas.push(linhaCSV(`DRE Receitas · ${periodoLabel}`))
  linhas.push(linhaCSV("Categoria", "Lançamentos", "Total (R$)", "% do total"))
  for (const r of dre.receitas) {
    const pct = dre.total_receitas > 0 ? (r.total / dre.total_receitas) * 100 : 0
    linhas.push(linhaCSV(r.categoria_nome, r.qtd, csvValor(r.total), `${pct.toFixed(1)}%`))
  }
  linhas.push(linhaCSV("TOTAL RECEITAS", "", csvValor(dre.total_receitas), "100%"))
  linhas.push("")

  // === DRE Despesas ===
  linhas.push(linhaCSV(`DRE Despesas · ${periodoLabel}`))
  linhas.push(linhaCSV("Categoria", "Lançamentos", "Total (R$)", "% do total"))
  for (const d of dre.despesas) {
    const pct = dre.total_despesas > 0 ? (d.total / dre.total_despesas) * 100 : 0
    linhas.push(linhaCSV(d.categoria_nome, d.qtd, csvValor(d.total), `${pct.toFixed(1)}%`))
  }
  linhas.push(linhaCSV("TOTAL DESPESAS", "", csvValor(dre.total_despesas), "100%"))
  linhas.push("")

  // === Resultado ===
  linhas.push(linhaCSV("RESULTADO DO PERÍODO", csvValor(dre.resultado)))
  linhas.push("")

  // === Projeção 3 meses ===
  if (projecao.length > 0) {
    linhas.push(linhaCSV("Projeção dos próximos 3 meses"))
    linhas.push(linhaCSV("Mês", "Receita projetada (R$)", "Despesa projetada (R$)", "Resultado (R$)"))
    for (const p of projecao) {
      linhas.push(
        linhaCSV(p.rotulo, csvValor(p.receitas), csvValor(p.despesas), csvValor(p.resultado))
      )
    }
    linhas.push("")
  }

  // === Histórico do ano ===
  linhas.push(linhaCSV(`Histórico do ano ${ano}`))
  linhas.push(linhaCSV("Mês", "Receitas (R$)", "Despesas (R$)", "Resultado (R$)"))
  for (const p of fluxo) {
    linhas.push(
      linhaCSV(rotuloMes(p.mes), csvValor(p.receitas), csvValor(p.despesas), csvValor(p.resultado))
    )
  }
  // Totais do ano
  const totalReceitas = fluxo.reduce((s, p) => s + p.receitas, 0)
  const totalDespesas = fluxo.reduce((s, p) => s + p.despesas, 0)
  linhas.push(
    linhaCSV(
      "TOTAL ANO",
      csvValor(totalReceitas),
      csvValor(totalDespesas),
      csvValor(totalReceitas - totalDespesas)
    )
  )

  // Usa CRLF (RFC 4180) — Excel para Windows prefere isso.
  return linhas.join("\r\n")
}

