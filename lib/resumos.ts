import {
  ANO_PADRAO,
  MESES,
  empresas,
  formatBRL,
  formatNumero,
  getFaturamentoMes,
  getResumoGrupo,
  metaAcumuladaAteHoje,
  type Mes,
} from "./data"
import { getDadosReaisDoMes, getDadosReais } from "./dados-reais"
import { getComissionamentoMes } from "./comissionamento-actions"

const BRL_TZ_OFFSET = -3 // BRT

function hojeBRL(): Date {
  const agora = new Date()
  const utc = agora.getTime() + agora.getTimezoneOffset() * 60000
  return new Date(utc + BRL_TZ_OFFSET * 3600000)
}

function mesAtual(): { mes: Mes; ano: number; hoje: Date } {
  const hoje = hojeBRL()
  const idx = hoje.getMonth() + 1
  const mesNomes: Record<number, Mes> = {
    4: "Abril",
    5: "Maio",
    6: "Junho",
    7: "Julho",
    8: "Agosto",
    9: "Setembro",
    10: "Outubro",
    11: "Novembro",
    12: "Dezembro",
  }
  const mes = mesNomes[idx] ?? "Abril"
  return { mes, ano: hoje.getFullYear(), hoje }
}

function statusEmoji(
  real: number,
  meta: number,
  metaAcum: number
): "🟢" | "🟡" | "🔴" {
  if (real >= meta) return "🟢"
  if (real >= metaAcum) return "🟡"
  return "🔴"
}

export async function montarResumoDiario(): Promise<string> {
  const { mes, ano, hoje } = mesAtual()
  const dd = String(hoje.getDate()).padStart(2, "0")
  const mm = String(hoje.getMonth() + 1).padStart(2, "0")
  const diaSemana = hoje.toLocaleDateString("pt-BR", { weekday: "short" })

  const resumo = getResumoGrupo(mes, ano)
  const reaisDoMes = await getDadosReaisDoMes(mes, ano)

  let somaFat = 0
  let somaInv = 0
  let somaLeads = 0
  let temDado = false
  for (const d of reaisDoMes.values()) {
    if (d.faturamento_real !== null) {
      somaFat += d.faturamento_real
      temDado = true
    }
    if (d.investimento_real !== null) {
      somaInv += d.investimento_real
      temDado = true
    }
    if (d.leads_real !== null) {
      somaLeads += d.leads_real
      temDado = true
    }
  }

  const metaFatAcum = metaAcumuladaAteHoje(resumo.faturamento, mes, ano, hoje)
  const status = statusEmoji(somaFat, resumo.faturamento, metaFatAcum)
  const statusTexto =
    status === "🟢" ? "No ritmo" : status === "🟡" ? "Atenção" : "Atrasado"

  const alertas: string[] = []
  for (const empresa of empresas) {
    if (empresa.tipo === "diego") continue
    const metaMes = getFaturamentoMes(empresa.slug, mes, ano)
    if (metaMes === 0) continue
    const real = reaisDoMes.get(empresa.db)
    const fatReal = real?.faturamento_real ?? null
    const metaAcum = metaAcumuladaAteHoje(metaMes, mes, ano, hoje)
    if (fatReal === null) {
      alertas.push(`${empresa.nome} — sem dados inseridos`)
    } else if (fatReal < metaAcum) {
      alertas.push(
        `${empresa.nome} — ${formatBRL(fatReal)} de ${formatBRL(
          metaAcum
        )} esperado até hoje`
      )
    }
  }

  const cpl = somaLeads > 0 ? somaInv / somaLeads : 0
  const atualizado = hoje.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  })

  const linhas = [
    `☀️ *Anômalo Hub — Resumo de ${diaSemana}, ${dd}/${mm}*`,
    "",
    "*Status do grupo hoje*",
    `Faturamento: ${formatBRL(somaFat)} de ${formatBRL(resumo.faturamento)} meta`,
    `${status} ${statusTexto}`,
    "",
  ]

  if (alertas.length === 0) {
    linhas.push("✅ Todas as empresas no ritmo")
  } else {
    linhas.push("*Empresas em alerta*")
    for (const a of alertas) linhas.push(a)
  }
  linhas.push("")
  linhas.push("*Investimento em ads hoje*")
  linhas.push(
    `${formatBRL(somaInv)} investido · ${formatNumero(
      somaLeads
    )} leads gerados · CPL ${formatBRL(cpl)}`
  )
  linhas.push(`Atualizado em ${atualizado}`)

  if (!temDado) {
    linhas.push("")
    linhas.push("_Nenhum dado real inserido ainda neste mês._")
  }

  return linhas.join("\n")
}

export async function montarResumoSemanal(
  linkFormulario?: string
): Promise<string> {
  const { mes, ano, hoje } = mesAtual()
  const inicioSemana = new Date(hoje)
  inicioSemana.setDate(hoje.getDate() - ((hoje.getDay() + 6) % 7))
  const fimSemana = new Date(hoje)
  const semana = Math.ceil(hoje.getDate() / 7)

  const resumo = getResumoGrupo(mes, ano)
  const reaisDoMes = await getDadosReaisDoMes(mes, ano)
  const comissoes = await getComissionamentoMes(mes, ano)

  let somaFat = 0
  let somaInv = 0
  let somaLeads = 0
  for (const d of reaisDoMes.values()) {
    if (d.faturamento_real !== null) somaFat += d.faturamento_real
    if (d.investimento_real !== null) somaInv += d.investimento_real
    if (d.leads_real !== null) somaLeads += d.leads_real
  }

  const progresso =
    resumo.faturamento > 0
      ? Math.min(100, Math.round((somaFat / resumo.faturamento) * 100))
      : 0
  const blocos = Math.round(progresso / 10)
  const barra = "█".repeat(blocos) + "░".repeat(10 - blocos)

  const linhas = [
    "📊 *Anômalo Hub — Resumo Semanal*",
    `Semana ${semana} · ${inicioSemana
      .toLocaleDateString("pt-BR")
      .slice(0, 5)} a ${fimSemana.toLocaleDateString("pt-BR")}`,
    "",
    "*Faturamento do Hub*",
    `Real: ${formatBRL(somaFat)}`,
    `Meta do mês: ${formatBRL(resumo.faturamento)}`,
    `Progresso: ${progresso}% [${barra}]`,
    "",
    "*Por empresa*",
  ]

  for (const empresa of empresas) {
    const metaMes = getFaturamentoMes(empresa.slug, mes, ano)
    const real = reaisDoMes.get(empresa.db)
    const fatReal = real?.faturamento_real ?? null
    if (fatReal === null) {
      linhas.push(`${empresa.nome} — Sem dados 🔴`)
      continue
    }
    const pct =
      metaMes > 0 ? Math.min(999, Math.round((fatReal / metaMes) * 100)) : 0
    const emoji =
      fatReal >= metaMes ? "🟢" : fatReal >= metaMes * 0.7 ? "🟡" : "🔴"
    linhas.push(
      `${empresa.nome} — ${formatBRL(fatReal)} (${pct}% da meta) ${emoji}`
    )
  }

  const cpl = somaLeads > 0 ? somaInv / somaLeads : 0
  linhas.push("")
  linhas.push("*Tráfego pago na semana*")
  linhas.push(`Investido: ${formatBRL(somaInv)}`)
  linhas.push(`Leads: ${formatNumero(somaLeads)}`)
  linhas.push(`CPL médio: ${formatBRL(cpl)}`)
  linhas.push("")
  linhas.push("*Comissionamento estimado*")
  const felipe = comissoes.find((c) => c.colaborador === "felipe")
  const vinicius = comissoes.find((c) => c.colaborador === "vinicius")
  const emanuel = comissoes.find((c) => c.colaborador === "emanuel")
  const gatilhosFelipe = felipe?.detalhes
    ? Object.values(felipe.detalhes).filter(Boolean).length
    : 0
  linhas.push(
    `Felipe: ${formatBRL(felipe?.bonus_calculado ?? 0)} (${gatilhosFelipe}/4 gatilhos)`
  )
  linhas.push(
    `Vinicius: ${formatBRL(vinicius?.bonus_calculado ?? 0)} (${
      vinicius?.entregas_validas ?? 0
    } entregas válidas)`
  )
  linhas.push(
    `Emanuel: ${formatBRL(emanuel?.bonus_calculado ?? 0)} (${
      emanuel?.entregas_validas ?? 0
    } entregas válidas)`
  )

  if (linkFormulario) {
    linhas.push("")
    linhas.push(`📝 Inserir dados da semana:`)
    linhas.push(linkFormulario)
  }

  return linhas.join("\n")
}

export async function montarResumoMensal(): Promise<string> {
  const { mes, ano, hoje } = mesAtual()
  const resumo = getResumoGrupo(mes, ano)
  const reaisDoMes = await getDadosReaisDoMes(mes, ano)
  const comissoes = await getComissionamentoMes(mes, ano)

  const mesAnteriorIdx = MESES.indexOf(mes) - 1
  const mesAnterior = mesAnteriorIdx >= 0 ? MESES[mesAnteriorIdx] : null

  let somaFat = 0
  let somaInv = 0
  let somaLeads = 0
  for (const d of reaisDoMes.values()) {
    if (d.faturamento_real !== null) somaFat += d.faturamento_real
    if (d.investimento_real !== null) somaInv += d.investimento_real
    if (d.leads_real !== null) somaLeads += d.leads_real
  }

  const atingido =
    resumo.faturamento > 0
      ? Math.round((somaFat / resumo.faturamento) * 100)
      : 0
  const statusGlobal =
    atingido >= 100 ? "🟢 Bateu" : atingido >= 70 ? "🟡 Parcial" : "🔴 Abaixo"

  const linhas = [
    `🏆 *Anômalo Hub — Fechamento de ${mes} ${ano}*`,
    "",
    "*Resultado do grupo*",
    `Faturamento: ${formatBRL(somaFat)} de ${formatBRL(resumo.faturamento)} meta`,
    `Atingido: ${atingido}% ${statusGlobal}`,
    "",
    "*Empresas — resultado final*",
  ]

  let melhorNome = ""
  let melhorPct = -1
  let crescimentoNome = ""
  let crescimentoPct = -1

  for (const empresa of empresas) {
    const metaMes = getFaturamentoMes(empresa.slug, mes, ano)
    const real = reaisDoMes.get(empresa.db)?.faturamento_real ?? 0
    const pct = metaMes > 0 ? Math.round((real / metaMes) * 100) : 0
    const emoji =
      pct >= 100 ? "✅ Meta batida" : pct >= 70 ? `⚠️ ${pct}% da meta` : "❌ Abaixo da meta"
    linhas.push(`${empresa.nome}  ${formatBRL(real)}  ${emoji}`)

    if (pct > melhorPct) {
      melhorPct = pct
      melhorNome = empresa.nome
    }

    if (mesAnterior) {
      const realAnterior =
        (await getDadosReais(empresa.db, ano)).find(
          (r) => r.mes === mesAnterior
        )?.faturamento_real ?? 0
      if (realAnterior > 0) {
        const cresc = Math.round(((real - realAnterior) / realAnterior) * 100)
        if (cresc > crescimentoPct) {
          crescimentoPct = cresc
          crescimentoNome = empresa.nome
        }
      }
    }
  }

  const cpl = somaLeads > 0 ? somaInv / somaLeads : 0
  linhas.push("")
  linhas.push("*Tráfego pago no mês*")
  linhas.push(
    `Investido: ${formatBRL(somaInv)} · Leads: ${formatNumero(
      somaLeads
    )} · CPL: ${formatBRL(cpl)}`
  )
  linhas.push("")
  linhas.push("*Comissionamento final*")
  const felipe = comissoes.find((c) => c.colaborador === "felipe")
  const vinicius = comissoes.find((c) => c.colaborador === "vinicius")
  const emanuel = comissoes.find((c) => c.colaborador === "emanuel")
  const totalComissao =
    (felipe?.bonus_calculado ?? 0) +
    (vinicius?.bonus_calculado ?? 0) +
    (emanuel?.bonus_calculado ?? 0)
  linhas.push(`Felipe:   ${formatBRL(felipe?.bonus_calculado ?? 0)}`)
  linhas.push(`Vinicius: ${formatBRL(vinicius?.bonus_calculado ?? 0)}`)
  linhas.push(`Emanuel:  ${formatBRL(emanuel?.bonus_calculado ?? 0)}`)
  linhas.push(`Total:    ${formatBRL(totalComissao)}`)
  linhas.push("")
  linhas.push("*Destaques*")
  if (melhorNome) {
    const acima = Math.max(0, melhorPct - 100)
    linhas.push(
      `Melhor empresa: ${melhorNome} (${
        acima > 0 ? `${acima}% acima` : `${melhorPct}% da`
      } meta)`
    )
  }
  if (crescimentoNome) {
    linhas.push(
      `Maior crescimento: ${crescimentoNome} (+${crescimentoPct}% vs ${mesAnterior})`
    )
  }
  linhas.push("")
  linhas.push("Bom trabalho a todos! 💛")

  return linhas.join("\n")
}

export function ehUltimoDiaMes(hoje: Date = new Date()): boolean {
  const amanha = new Date(hoje)
  amanha.setDate(hoje.getDate() + 1)
  return amanha.getDate() === 1
}

export { mesAtual, ANO_PADRAO }
