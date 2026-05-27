"use client"

import type { DREMes } from "@/lib/financeiro"
import type { Mes } from "@/lib/data"

interface PontoFluxo {
  mes: Mes
  receitas: number
  despesas: number
  resultado: number
}

interface ProjecaoPonto {
  mes: Mes
  receitas: number
  despesas: number
  resultado: number
}

interface Props {
  dre: DREMes
  fluxo: PontoFluxo[]
  projecao: ProjecaoPonto[]
  mes: Mes
  ano: number
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
}: Props) {
  function exportarCSV() {
    const csv = montarCSV(dre, fluxo, projecao, mes, ano)
    // BOM UTF-8 — sem ele, Excel mostra "Mãe" como "MÃ£e".
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `relatorio-financeiro-${mes.toLowerCase()}-${ano}.csv`
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

function csvCampo(v: string | number): string {
  const s = String(v)
  // Aspas ao redor se tem vírgula, aspas ou quebra. Aspa dupla escapa
  // com aspa dupla (RFC 4180).
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function linhaCSV(...campos: (string | number)[]): string {
  return campos.map(csvCampo).join(",")
}

function montarCSV(
  dre: DREMes,
  fluxo: PontoFluxo[],
  projecao: ProjecaoPonto[],
  mes: Mes,
  ano: number
): string {
  const linhas: string[] = []

  // Cabeçalho geral
  linhas.push(linhaCSV("Relatório financeiro — Anômalo Hub"))
  linhas.push(linhaCSV(`Mês de referência: ${mes}/${ano}`))
  linhas.push(
    linhaCSV(
      `Gerado em: ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`
    )
  )
  linhas.push("")

  // === DRE Receitas ===
  linhas.push(linhaCSV(`DRE Receitas — ${mes}/${ano}`))
  linhas.push(linhaCSV("Categoria", "Lançamentos", "Total (R$)", "% do total"))
  for (const r of dre.receitas) {
    const pct = dre.total_receitas > 0 ? (r.total / dre.total_receitas) * 100 : 0
    linhas.push(linhaCSV(r.categoria_nome, r.qtd, r.total.toFixed(2), `${pct.toFixed(1)}%`))
  }
  linhas.push(linhaCSV("TOTAL RECEITAS", "", dre.total_receitas.toFixed(2), "100%"))
  linhas.push("")

  // === DRE Despesas ===
  linhas.push(linhaCSV(`DRE Despesas — ${mes}/${ano}`))
  linhas.push(linhaCSV("Categoria", "Lançamentos", "Total (R$)", "% do total"))
  for (const d of dre.despesas) {
    const pct = dre.total_despesas > 0 ? (d.total / dre.total_despesas) * 100 : 0
    linhas.push(linhaCSV(d.categoria_nome, d.qtd, d.total.toFixed(2), `${pct.toFixed(1)}%`))
  }
  linhas.push(linhaCSV("TOTAL DESPESAS", "", dre.total_despesas.toFixed(2), "100%"))
  linhas.push("")

  // === Resultado ===
  linhas.push(linhaCSV("RESULTADO DO MÊS", dre.resultado.toFixed(2)))
  linhas.push("")

  // === Projeção 3 meses ===
  if (projecao.length > 0) {
    linhas.push(linhaCSV("Projeção dos próximos 3 meses"))
    linhas.push(linhaCSV("Mês", "Receita projetada (R$)", "Despesa projetada (R$)", "Resultado (R$)"))
    for (const p of projecao) {
      linhas.push(
        linhaCSV(p.mes, p.receitas.toFixed(2), p.despesas.toFixed(2), p.resultado.toFixed(2))
      )
    }
    linhas.push("")
  }

  // === Histórico do ano ===
  linhas.push(linhaCSV(`Histórico do ano ${ano}`))
  linhas.push(linhaCSV("Mês", "Receitas (R$)", "Despesas (R$)", "Resultado (R$)"))
  for (const p of fluxo) {
    linhas.push(
      linhaCSV(p.mes, p.receitas.toFixed(2), p.despesas.toFixed(2), p.resultado.toFixed(2))
    )
  }
  // Totais do ano
  const totalReceitas = fluxo.reduce((s, p) => s + p.receitas, 0)
  const totalDespesas = fluxo.reduce((s, p) => s + p.despesas, 0)
  linhas.push(
    linhaCSV(
      "TOTAL ANO",
      totalReceitas.toFixed(2),
      totalDespesas.toFixed(2),
      (totalReceitas - totalDespesas).toFixed(2)
    )
  )

  // Usa CRLF (RFC 4180) — Excel para Windows prefere isso.
  return linhas.join("\r\n")
}

