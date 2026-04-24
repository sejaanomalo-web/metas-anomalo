import {
  ANO_PADRAO,
  MESES,
  empresas as empresasHardcoded,
  formatBRL,
  formatNumero,
  getFaturamentoMesComOverride,
  getResumoGrupo,
  metaAcumuladaAteHoje,
  type EmpresaMeta,
  type Mes,
} from "./data"
import {
  type DadosReaisPorOrigem,
  getDadosReaisDoMes,
  getDadosReais,
} from "./dados-reais"
import { getComissionamentoMes } from "./comissionamento-actions"
import { listarEmpresas } from "./empresas-actions"
import { getOverridesTodasEmpresasMes } from "./metas-empresa"

// Soma dos reais do mês respeitando a semântica por origem:
//   - investimento/CPL     → só 'pago' (orgânico não tem verba)
//   - faturamento/leads    → 'pago' + 'organico' (o Hub vê o total)
function agregarReaisDoMes(mapa: Map<string, DadosReaisPorOrigem>) {
  let somaFat = 0
  let somaInv = 0
  let somaLeads = 0
  let temFat = false
  let temInv = false
  let temLeads = false
  for (const { pago, organico } of mapa.values()) {
    if (pago?.investimento_real !== null && pago?.investimento_real !== undefined) {
      somaInv += pago.investimento_real
      temInv = true
    }
    for (const d of [pago, organico]) {
      if (!d) continue
      if (d.faturamento_real !== null) {
        somaFat += d.faturamento_real
        temFat = true
      }
      if (d.leads_real !== null) {
        somaLeads += d.leads_real
        temLeads = true
      }
    }
  }
  return { somaFat, somaInv, somaLeads, temFat, temInv, temLeads }
}

function faturamentoTotalDoBucket(b: DadosReaisPorOrigem | undefined): number | null {
  if (!b) return null
  const p = b.pago?.faturamento_real ?? null
  const o = b.organico?.faturamento_real ?? null
  if (p === null && o === null) return null
  return (p ?? 0) + (o ?? 0)
}

async function carregarContexto(mes: Mes, ano: number): Promise<{
  empresas: EmpresaMeta[]
  overridesMes: Map<string, Record<string, number>>
}> {
  const [empresasList, overridesMes] = await Promise.all([
    listarEmpresas(true).catch(() => empresasHardcoded),
    getOverridesTodasEmpresasMes(mes, ano).catch(
      () => new Map<string, Record<string, number>>()
    ),
  ])
  const emp = empresasList.length > 0 ? empresasList : empresasHardcoded
  return { empresas: emp, overridesMes }
}

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

function statusTexto(real: number, meta: number, metaAcum: number): string {
  if (real >= meta) return "no ritmo"
  if (real >= metaAcum) return "atenção"
  return "atrasado"
}

export async function montarResumoDiario(): Promise<string> {
  const { mes, ano, hoje } = mesAtual()
  const dd = String(hoje.getDate()).padStart(2, "0")
  const mm = String(hoje.getMonth() + 1).padStart(2, "0")
  const diaSemana = hoje.toLocaleDateString("pt-BR", { weekday: "long" })
  const diaSemanaCap =
    diaSemana.charAt(0).toUpperCase() + diaSemana.slice(1).replace("-feira", "")

  const { empresas, overridesMes } = await carregarContexto(mes, ano)
  const resumo = getResumoGrupo(mes, ano, empresas, overridesMes)
  const reaisDoMes = await getDadosReaisDoMes(mes, ano)

  const { somaFat, somaInv, somaLeads, temFat, temInv, temLeads } =
    agregarReaisDoMes(reaisDoMes)
  const temDado = temFat || temInv || temLeads

  const metaFatAcum = metaAcumuladaAteHoje(resumo.faturamento, mes, ano, hoje)
  const situacao = statusTexto(somaFat, resumo.faturamento, metaFatAcum)
  const progresso =
    resumo.faturamento > 0
      ? Math.min(100, Math.round((somaFat / resumo.faturamento) * 100))
      : 0
  const blocos = Math.round(progresso / 10)
  const barra = "█".repeat(blocos) + "░".repeat(10 - blocos)

  const alertas: { nome: string; texto: string }[] = []
  for (const empresa of empresas) {
    if (empresa.tipo === "diego") continue
    const metaMes = getFaturamentoMesComOverride(
      empresa,
      mes,
      ano,
      overridesMes.get(empresa.db)
    )
    if (metaMes === 0) continue
    const fatReal = faturamentoTotalDoBucket(reaisDoMes.get(empresa.db))
    const metaAcum = metaAcumuladaAteHoje(metaMes, mes, ano, hoje)
    if (fatReal === null) {
      alertas.push({ nome: empresa.nome, texto: "sem dados" })
    } else if (fatReal < metaAcum) {
      alertas.push({
        nome: empresa.nome,
        texto: `${formatBRL(fatReal)} de ${formatBRL(metaAcum)} esperado`,
      })
    }
  }

  const cpl = somaLeads > 0 ? somaInv / somaLeads : 0
  const atualizado = hoje.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  })

  const divisor = "—".repeat(24)
  const linhas: string[] = [
    "*ANÔMALO HUB*",
    `Resumo Diário · ${diaSemanaCap}, ${dd}/${mm}`,
    divisor,
    "",
    "*STATUS DO GRUPO*",
    `Real:          ${formatBRL(somaFat)}`,
    `Meta do mês:   ${formatBRL(resumo.faturamento)}`,
    `Esperado hoje: ${formatBRL(metaFatAcum)}`,
    `Progresso:     ${progresso}% [${barra}]`,
    `Situação:      ${situacao}`,
    "",
    divisor,
    "",
    "*ALERTAS*",
  ]

  if (alertas.length === 0) {
    linhas.push("Todas as empresas no ritmo.")
  } else {
    const nomeLen = Math.max(...alertas.map((a) => a.nome.length))
    for (const a of alertas) {
      linhas.push(`${a.nome.padEnd(nomeLen)}  ·  ${a.texto}`)
    }
  }

  linhas.push("")
  linhas.push(divisor)
  linhas.push("")
  linhas.push("*TRÁFEGO PAGO HOJE*")
  linhas.push(`Investido:  ${formatBRL(somaInv)}`)
  linhas.push(`Leads:      ${formatNumero(somaLeads)}`)
  linhas.push(`CPL:        ${formatBRL(cpl)}`)
  linhas.push("")
  linhas.push(divisor)
  linhas.push("")
  linhas.push(`Atualizado em ${atualizado}`)

  if (!temDado) {
    linhas.push("")
    linhas.push("Nenhum dado real inserido ainda neste mês.")
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

  const { empresas, overridesMes } = await carregarContexto(mes, ano)
  const resumo = getResumoGrupo(mes, ano, empresas, overridesMes)
  const reaisDoMes = await getDadosReaisDoMes(mes, ano)
  const comissoes = await getComissionamentoMes(mes, ano)

  const { somaFat, somaInv, somaLeads } = agregarReaisDoMes(reaisDoMes)

  const progresso =
    resumo.faturamento > 0
      ? Math.min(100, Math.round((somaFat / resumo.faturamento) * 100))
      : 0
  const blocos = Math.round(progresso / 10)
  const barra = "█".repeat(blocos) + "░".repeat(10 - blocos)

  const divisor = "—".repeat(24)
  const linhas: string[] = [
    "*ANÔMALO HUB*",
    `Resumo Semanal · Semana ${semana}`,
    `${inicioSemana
      .toLocaleDateString("pt-BR")
      .slice(0, 5)} a ${fimSemana.toLocaleDateString("pt-BR")}`,
    divisor,
    "",
    "*FATURAMENTO DO HUB*",
    `Real:         ${formatBRL(somaFat)}`,
    `Meta do mês:  ${formatBRL(resumo.faturamento)}`,
    `Progresso:    ${progresso}% [${barra}]`,
    "",
    divisor,
    "",
    "*POR EMPRESA*",
  ]

  function classificar(
    fat: number | null,
    metaMes: number
  ): { label: string; pct: number } {
    if (fat === null) return { label: "sem dados", pct: 0 }
    const pct =
      metaMes > 0 ? Math.min(999, Math.round((fat / metaMes) * 100)) : 0
    if (fat >= metaMes) return { label: "meta batida", pct }
    if (fat >= metaMes * 0.7) return { label: "atenção", pct }
    return { label: "atrasado", pct }
  }

  const nomeLen = Math.max(...empresas.map((e) => e.nome.length))
  for (const empresa of empresas) {
    const metaMes = getFaturamentoMesComOverride(
      empresa,
      mes,
      ano,
      overridesMes.get(empresa.db)
    )
    const fatReal = faturamentoTotalDoBucket(reaisDoMes.get(empresa.db))
    const cls = classificar(fatReal, metaMes)
    const nomePad = empresa.nome.padEnd(nomeLen)
    if (fatReal === null) {
      linhas.push(`${nomePad}  ·  ${cls.label}`)
    } else {
      linhas.push(
        `${nomePad}  ${formatBRL(fatReal)}  (${cls.pct}%)  ·  ${cls.label}`
      )
    }
  }

  const cpl = somaLeads > 0 ? somaInv / somaLeads : 0
  linhas.push("")
  linhas.push(divisor)
  linhas.push("")
  linhas.push("*TRÁFEGO PAGO NA SEMANA*")
  linhas.push(`Investido:   ${formatBRL(somaInv)}`)
  linhas.push(`Leads:       ${formatNumero(somaLeads)}`)
  linhas.push(`CPL médio:   ${formatBRL(cpl)}`)
  linhas.push("")
  linhas.push(divisor)
  linhas.push("")
  linhas.push("*COMISSIONAMENTO ESTIMADO*")
  const felipe = comissoes.find((c) => c.colaborador === "felipe")
  const vinicius = comissoes.find((c) => c.colaborador === "vinicius")
  const emanuel = comissoes.find((c) => c.colaborador === "emanuel")
  const gatilhosFelipe = felipe?.detalhes
    ? Object.values(felipe.detalhes).filter(Boolean).length
    : 0
  linhas.push(
    `Felipe:    ${formatBRL(felipe?.bonus_calculado ?? 0)}  (${gatilhosFelipe}/4 gatilhos)`
  )
  linhas.push(
    `Vinicius:  ${formatBRL(vinicius?.bonus_calculado ?? 0)}  (${
      vinicius?.entregas_validas ?? 0
    } entregas)`
  )
  linhas.push(
    `Emanuel:   ${formatBRL(emanuel?.bonus_calculado ?? 0)}  (${
      emanuel?.entregas_validas ?? 0
    } entregas)`
  )

  if (linkFormulario) {
    linhas.push("")
    linhas.push(divisor)
    linhas.push("")
    linhas.push("*INSERIR DADOS DA SEMANA*")
    linhas.push(linkFormulario)
  }

  return linhas.join("\n")
}

export async function montarResumoMensal(): Promise<string> {
  const { mes, ano, hoje } = mesAtual()
  const { empresas, overridesMes } = await carregarContexto(mes, ano)
  const resumo = getResumoGrupo(mes, ano, empresas, overridesMes)
  const reaisDoMes = await getDadosReaisDoMes(mes, ano)
  const comissoes = await getComissionamentoMes(mes, ano)

  const mesAnteriorIdx = MESES.indexOf(mes) - 1
  const mesAnterior = mesAnteriorIdx >= 0 ? MESES[mesAnteriorIdx] : null

  const { somaFat, somaInv, somaLeads } = agregarReaisDoMes(reaisDoMes)

  const atingido =
    resumo.faturamento > 0
      ? Math.round((somaFat / resumo.faturamento) * 100)
      : 0
  const statusGlobal =
    atingido >= 100 ? "meta batida" : atingido >= 70 ? "parcial" : "abaixo"

  const divisor = "—".repeat(24)
  const linhas: string[] = [
    "*ANÔMALO HUB*",
    `Fechamento · ${mes} ${ano}`,
    divisor,
    "",
    "*RESULTADO DO GRUPO*",
    `Faturamento:  ${formatBRL(somaFat)}`,
    `Meta:         ${formatBRL(resumo.faturamento)}`,
    `Atingido:     ${atingido}%  ·  ${statusGlobal}`,
    "",
    divisor,
    "",
    "*EMPRESAS*",
  ]

  let melhorNome = ""
  let melhorPct = -1
  let crescimentoNome = ""
  let crescimentoPct = -1

  const nomeLen = Math.max(...empresas.map((e) => e.nome.length))
  for (const empresa of empresas) {
    const metaMes = getFaturamentoMesComOverride(
      empresa,
      mes,
      ano,
      overridesMes.get(empresa.db)
    )
    const real = faturamentoTotalDoBucket(reaisDoMes.get(empresa.db)) ?? 0
    const pct = metaMes > 0 ? Math.round((real / metaMes) * 100) : 0
    const label =
      pct >= 100 ? "meta batida" : pct >= 70 ? `${pct}% da meta` : "abaixo"
    const nomePad = empresa.nome.padEnd(nomeLen)
    linhas.push(`${nomePad}  ${formatBRL(real)}  ·  ${label}`)

    if (pct > melhorPct) {
      melhorPct = pct
      melhorNome = empresa.nome
    }

    if (mesAnterior) {
      // Para crescimento pago vs orgânico, usamos faturamento pago + orgânico
      // do mês anterior como um todo (mesma regra do mês atual).
      const [pagoAnt, organicoAnt] = await Promise.all([
        getDadosReais(empresa.db, ano, "pago").then(
          (rs) => rs.find((r) => r.mes === mesAnterior)?.faturamento_real ?? 0
        ),
        getDadosReais(empresa.db, ano, "organico").then(
          (rs) => rs.find((r) => r.mes === mesAnterior)?.faturamento_real ?? 0
        ),
      ])
      const realAnterior = pagoAnt + organicoAnt
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
  linhas.push(divisor)
  linhas.push("")
  linhas.push("*TRÁFEGO PAGO NO MÊS*")
  linhas.push(`Investido:  ${formatBRL(somaInv)}`)
  linhas.push(`Leads:      ${formatNumero(somaLeads)}`)
  linhas.push(`CPL:        ${formatBRL(cpl)}`)
  linhas.push("")
  linhas.push(divisor)
  linhas.push("")
  linhas.push("*COMISSIONAMENTO FINAL*")
  const felipe = comissoes.find((c) => c.colaborador === "felipe")
  const vinicius = comissoes.find((c) => c.colaborador === "vinicius")
  const emanuel = comissoes.find((c) => c.colaborador === "emanuel")
  const totalComissao =
    (felipe?.bonus_calculado ?? 0) +
    (vinicius?.bonus_calculado ?? 0) +
    (emanuel?.bonus_calculado ?? 0)
  linhas.push(`Felipe:    ${formatBRL(felipe?.bonus_calculado ?? 0)}`)
  linhas.push(`Vinicius:  ${formatBRL(vinicius?.bonus_calculado ?? 0)}`)
  linhas.push(`Emanuel:   ${formatBRL(emanuel?.bonus_calculado ?? 0)}`)
  linhas.push(`Total:     ${formatBRL(totalComissao)}`)
  linhas.push("")
  linhas.push(divisor)
  linhas.push("")
  linhas.push("*DESTAQUES*")
  if (melhorNome) {
    const acima = Math.max(0, melhorPct - 100)
    linhas.push(
      `Melhor empresa:     ${melhorNome} (${
        acima > 0 ? `${acima}% acima` : `${melhorPct}% da`
      } meta)`
    )
  }
  if (crescimentoNome) {
    linhas.push(
      `Maior crescimento:  ${crescimentoNome} (+${crescimentoPct}% vs ${mesAnterior})`
    )
  }
  linhas.push("")
  linhas.push("Bom trabalho a todos.")

  return linhas.join("\n")
}

export function ehUltimoDiaMes(hoje: Date = new Date()): boolean {
  const amanha = new Date(hoje)
  amanha.setDate(hoje.getDate() + 1)
  return amanha.getDate() === 1
}

export { mesAtual, ANO_PADRAO }
