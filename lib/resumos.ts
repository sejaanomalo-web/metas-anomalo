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
} from "./dados-reais"
import { getDeltasDoPeriodo } from "./dados-diarios"
import { getComissionamentoMes } from "./comissionamento-actions"
import { listarEmpresas } from "./empresas-actions"
import { getOverridesTodasEmpresasMes } from "./metas-empresa"

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

// Soma dos reais do mês respeitando a semântica por origem:
//   - investimento/CPL     → só 'pago' (orgânico não tem verba)
//   - faturamento/leads/reunioes/contratos → 'pago' + 'organico'
function agregarReaisDoMes(mapa: Map<string, DadosReaisPorOrigem>) {
  let somaFat = 0
  let somaInv = 0
  let somaLeads = 0
  let somaReunioes = 0
  let somaContratos = 0
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
      if (d.reunioes_real !== null) somaReunioes += d.reunioes_real
      if (d.contratos_real !== null) somaContratos += d.contratos_real
    }
  }
  return {
    somaFat,
    somaInv,
    somaLeads,
    somaReunioes,
    somaContratos,
    temFat,
    temInv,
    temLeads,
  }
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

/**
 * Sanitização final para WhatsApp:
 *  - Colapsa múltiplos espaços em um
 *  - Colapsa 3+ quebras de linha em 2 (mantém parágrafos, elimina gaps)
 *  - Remove espaços no fim de cada linha
 *
 * Formatação *negrito*, _itálico_ e emojis passam intactos pelo clipboard
 * e pelo encodeURIComponent do link wa.me — nenhum é tocado aqui.
 */
function sanitizarParaWa(texto: string): string {
  return texto
    .split("\n")
    .map((linha) => linha.replace(/[ \t]+/g, " ").replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

export async function montarResumoDiario(): Promise<string> {
  const { mes, ano, hoje } = mesAtual()
  const dd = String(hoje.getDate()).padStart(2, "0")
  const mm = String(hoje.getMonth() + 1).padStart(2, "0")
  const aaaa = hoje.getFullYear()
  const diaSemana = hoje.toLocaleDateString("pt-BR", { weekday: "long" })
  const diaSemanaCap =
    diaSemana.charAt(0).toUpperCase() + diaSemana.slice(1).replace("-feira", "")

  const { empresas, overridesMes } = await carregarContexto(mes, ano)
  const resumo = getResumoGrupo(mes, ano, empresas, overridesMes)
  const reaisDoMes = await getDadosReaisDoMes(mes, ano)

  // Deltas do dia — só o que foi reportado HOJE pelos formulários
  const hojeISO = isoDate(hoje)
  const dia = await getDeltasDoPeriodo(hojeISO, hojeISO)

  const metaFatAcum = metaAcumuladaAteHoje(resumo.faturamento, mes, ano, hoje)
  const progressoMes =
    resumo.faturamento > 0
      ? Math.min(
          100,
          Math.round(
            (agregarReaisDoMes(reaisDoMes).somaFat / resumo.faturamento) * 100
          )
        )
      : 0

  // Alertas continuam mensais — são sobre progresso da meta acumulada.
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

  // POR EMPRESA = quem reportou no dia (faturamento gerado hoje)
  const empresasComMovimentoHoje = empresas
    .map((e) => ({
      nome: e.nome,
      delta: dia.porEmpresa.get(e.db),
    }))
    .filter((e) => e.delta !== undefined)

  const cplDia = dia.somaLeads > 0 ? dia.somaInvestimento / dia.somaLeads : 0
  const cpaDia =
    dia.somaContratos > 0 ? dia.somaInvestimento / dia.somaContratos : 0
  const atualizado = hoje.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  })

  const linhas: string[] = [
    `🛒 *CONVERSÕES Diário - Anômalo Hub*`,
    `📅 ${diaSemanaCap}, ${dd}/${mm}/${aaaa}`,
    "",
    `💰 *INVESTIMENTO HOJE*`,
    `${formatBRL(dia.somaInvestimento)} investido hoje`,
    "",
    `🎯 *RESULTADOS DO DIA*`,
    `• ${formatNumero(dia.somaContratos)} contratos = ${formatBRL(
      dia.somaFaturamento
    )}`,
    `• Meta do mês: ${formatBRL(resumo.faturamento)} (${progressoMes}%)`,
    `• Esperado hoje: ${formatBRL(metaFatAcum)}`,
    "",
    `📊 *FUNIL DE HOJE*`,
    `👥 ${formatNumero(dia.somaLeads)} leads captados`,
    `📞 ${formatNumero(dia.somaReunioes)} reuniões marcadas`,
    `✅ ${formatNumero(dia.somaContratos)} contratos fechados`,
    "",
    `💡 *EFICIÊNCIA DO DIA*`,
    `• CPL: ${cplDia > 0 ? formatBRL(cplDia) : "—"}`,
    `• CPA: ${cpaDia > 0 ? formatBRL(cpaDia) : "—"}`,
  ]

  if (empresasComMovimentoHoje.length > 0) {
    linhas.push("")
    linhas.push(`🏢 *MOVIMENTO POR EMPRESA HOJE*`)
    for (const e of empresasComMovimentoHoje) {
      const d = e.delta!
      const partes: string[] = []
      if (d.faturamento > 0) partes.push(formatBRL(d.faturamento))
      if (d.leads > 0) partes.push(`${formatNumero(d.leads)} leads`)
      if (d.contratos > 0)
        partes.push(`${formatNumero(d.contratos)} contratos`)
      linhas.push(
        `• ${e.nome} · ${partes.length > 0 ? partes.join(" · ") : "movimento sem números"}`
      )
    }
  } else {
    linhas.push("")
    linhas.push(`🏢 *MOVIMENTO POR EMPRESA HOJE*`)
    linhas.push("Nenhuma empresa reportou hoje ainda.")
  }

  if (alertas.length > 0) {
    linhas.push("")
    linhas.push(`⚠️ *ATENÇÃO (acumulado do mês)*`)
    for (const a of alertas) {
      linhas.push(`• ${a.nome}: ${a.texto}`)
    }
  }

  linhas.push("")
  linhas.push(`_Atualizado ${atualizado}_`)

  return sanitizarParaWa(linhas.join("\n"))
}

export async function montarResumoSemanal(
  linkFormulario?: string
): Promise<string> {
  const { mes, ano, hoje } = mesAtual()
  // Segunda da semana atual (ISO week start) até hoje
  const inicioSemana = new Date(hoje)
  inicioSemana.setDate(hoje.getDate() - ((hoje.getDay() + 6) % 7))
  const fimSemana = new Date(hoje)
  const semana = Math.ceil(hoje.getDate() / 7)

  const { empresas, overridesMes } = await carregarContexto(mes, ano)
  const resumo = getResumoGrupo(mes, ano, empresas, overridesMes)
  const comissoes = await getComissionamentoMes(mes, ano)

  // Deltas da semana — só o que foi reportado de segunda a hoje
  const inicioISO = isoDate(inicioSemana)
  const fimISO = isoDate(fimSemana)
  const semanaAg = await getDeltasDoPeriodo(inicioISO, fimISO)

  // Progresso mensal pra contexto
  const reaisDoMes = await getDadosReaisDoMes(mes, ano)
  const { somaFat: faturamentoMes } = agregarReaisDoMes(reaisDoMes)
  const progressoMes =
    resumo.faturamento > 0
      ? Math.min(100, Math.round((faturamentoMes / resumo.faturamento) * 100))
      : 0

  const cplSem =
    semanaAg.somaLeads > 0
      ? semanaAg.somaInvestimento / semanaAg.somaLeads
      : 0
  const cpaSem =
    semanaAg.somaContratos > 0
      ? semanaAg.somaInvestimento / semanaAg.somaContratos
      : 0

  const periodo = `${inicioSemana
    .toLocaleDateString("pt-BR")} - ${fimSemana.toLocaleDateString("pt-BR")}`

  const linhas: string[] = [
    `🛒 *CONVERSÕES Semanal - Anômalo Hub*`,
    `📅 Semana ${semana} · ${periodo}`,
    "",
    `💰 *INVESTIMENTO NA SEMANA*`,
    `${formatBRL(semanaAg.somaInvestimento)} investido nesta semana`,
    "",
    `🎯 *RESULTADOS DA SEMANA*`,
    `• ${formatNumero(semanaAg.somaContratos)} contratos = ${formatBRL(
      semanaAg.somaFaturamento
    )}`,
    `• Meta do mês: ${formatBRL(resumo.faturamento)} (${progressoMes}%)`,
    "",
    `📊 *FUNIL DA SEMANA*`,
    `👥 ${formatNumero(semanaAg.somaLeads)} leads captados`,
    `📞 ${formatNumero(semanaAg.somaReunioes)} reuniões marcadas`,
    `✅ ${formatNumero(semanaAg.somaContratos)} contratos fechados`,
    "",
    `💡 *EFICIÊNCIA DA SEMANA*`,
    `• CPL: ${cplSem > 0 ? formatBRL(cplSem) : "—"}`,
    `• CPA: ${cpaSem > 0 ? formatBRL(cpaSem) : "—"}`,
  ]

  // POR EMPRESA na semana
  linhas.push("")
  linhas.push(`🏢 *MOVIMENTO POR EMPRESA NA SEMANA*`)
  let temAlgumaEmpresa = false
  for (const empresa of empresas) {
    const d = semanaAg.porEmpresa.get(empresa.db)
    if (!d) continue
    temAlgumaEmpresa = true
    const partes: string[] = []
    if (d.faturamento > 0) partes.push(formatBRL(d.faturamento))
    if (d.leads > 0) partes.push(`${formatNumero(d.leads)} leads`)
    if (d.contratos > 0) partes.push(`${formatNumero(d.contratos)} contratos`)
    linhas.push(
      `• ${empresa.nome} · ${
        partes.length > 0 ? partes.join(" · ") : "movimento sem números"
      }`
    )
  }
  if (!temAlgumaEmpresa) {
    linhas.push("Nenhuma empresa reportou nesta semana ainda.")
  }

  linhas.push("")
  linhas.push(`💼 *COMISSIONAMENTO ESTIMADO (acumulado do mês)*`)
  const felipe = comissoes.find((c) => c.colaborador === "felipe")
  const vinicius = comissoes.find((c) => c.colaborador === "vinicius")
  const emanuel = comissoes.find((c) => c.colaborador === "emanuel")
  const gatilhosFelipe = felipe?.detalhes
    ? Object.values(felipe.detalhes).filter(Boolean).length
    : 0
  linhas.push(
    `• Felipe: ${formatBRL(felipe?.bonus_calculado ?? 0)} (${gatilhosFelipe}/4 gatilhos)`
  )
  linhas.push(
    `• Vinicius: ${formatBRL(vinicius?.bonus_calculado ?? 0)} (${
      vinicius?.entregas_validas ?? 0
    } entregas)`
  )
  linhas.push(
    `• Emanuel: ${formatBRL(emanuel?.bonus_calculado ?? 0)} (${
      emanuel?.entregas_validas ?? 0
    } entregas)`
  )

  if (linkFormulario) {
    linhas.push("")
    linhas.push(`📝 *INSERIR DADOS DA SEMANA*`)
    linhas.push(linkFormulario)
  }

  return sanitizarParaWa(linhas.join("\n"))
}

export async function montarResumoMensal(): Promise<string> {
  const { mes, ano } = mesAtual()
  const { empresas, overridesMes } = await carregarContexto(mes, ano)
  const resumo = getResumoGrupo(mes, ano, empresas, overridesMes)
  const mesAnteriorIdx = MESES.indexOf(mes) - 1
  const mesAnterior = mesAnteriorIdx >= 0 ? MESES[mesAnteriorIdx] : null

  // Carrega tudo em paralelo: mes atual, mes anterior (se houver) e
  // comissionamento. Antes era N+1 — uma chamada de getDadosReais por
  // empresa por origem dentro do loop.
  const [reaisDoMes, reaisMesAnterior, comissoes] = await Promise.all([
    getDadosReaisDoMes(mes, ano),
    mesAnterior
      ? getDadosReaisDoMes(mesAnterior, ano)
      : Promise.resolve(new Map<string, DadosReaisPorOrigem>()),
    getComissionamentoMes(mes, ano),
  ])

  const { somaFat, somaInv, somaLeads, somaReunioes, somaContratos } =
    agregarReaisDoMes(reaisDoMes)

  const atingido =
    resumo.faturamento > 0
      ? Math.round((somaFat / resumo.faturamento) * 100)
      : 0
  const statusGlobal =
    atingido >= 100 ? "meta batida" : atingido >= 70 ? "parcial" : "abaixo"

  let melhorNome = ""
  let melhorPct = -1
  let crescimentoNome = ""
  let crescimentoPct = -1

  const linhasEmpresa: string[] = []
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
    linhasEmpresa.push(`• ${empresa.nome} · ${formatBRL(real)} · ${label}`)

    if (pct > melhorPct) {
      melhorPct = pct
      melhorNome = empresa.nome
    }

    if (mesAnterior) {
      const realAnterior =
        faturamentoTotalDoBucket(reaisMesAnterior.get(empresa.db)) ?? 0
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
  const cpa = somaContratos > 0 ? somaInv / somaContratos : 0

  const felipe = comissoes.find((c) => c.colaborador === "felipe")
  const vinicius = comissoes.find((c) => c.colaborador === "vinicius")
  const emanuel = comissoes.find((c) => c.colaborador === "emanuel")
  const totalComissao =
    (felipe?.bonus_calculado ?? 0) +
    (vinicius?.bonus_calculado ?? 0) +
    (emanuel?.bonus_calculado ?? 0)

  const linhas: string[] = [
    `🛒 *FECHAMENTO - Anômalo Hub*`,
    `📅 ${mes} ${ano}`,
    "",
    `💰 *INVESTIMENTO*`,
    `${formatBRL(somaInv)} investido no mês`,
    "",
    `🎯 *RESULTADO FINAL*`,
    `• ${formatNumero(somaContratos)} contratos = ${formatBRL(somaFat)}`,
    `• Meta: ${formatBRL(resumo.faturamento)} (${atingido}% · ${statusGlobal})`,
    "",
    `📊 *FUNIL DO HUB*`,
    `👥 ${formatNumero(somaLeads)} leads captados`,
    `📞 ${formatNumero(somaReunioes)} reuniões marcadas`,
    `✅ ${formatNumero(somaContratos)} contratos fechados`,
    "",
    `💡 *EFICIÊNCIA*`,
    `• CPL: ${cpl > 0 ? formatBRL(cpl) : "—"}`,
    `• CPA: ${cpa > 0 ? formatBRL(cpa) : "—"}`,
    "",
    `🏢 *EMPRESAS*`,
    ...linhasEmpresa,
    "",
    `🏆 *DESTAQUES*`,
  ]

  if (melhorNome) {
    const acima = Math.max(0, melhorPct - 100)
    linhas.push(
      `• Melhor empresa: ${melhorNome} (${
        acima > 0 ? `${acima}% acima` : `${melhorPct}% da`
      } meta)`
    )
  }
  if (crescimentoNome) {
    linhas.push(
      `• Maior crescimento: ${crescimentoNome} (+${crescimentoPct}% vs ${mesAnterior})`
    )
  }

  linhas.push("")
  linhas.push(`💼 *COMISSIONAMENTO FINAL*`)
  linhas.push(`• Felipe: ${formatBRL(felipe?.bonus_calculado ?? 0)}`)
  linhas.push(`• Vinicius: ${formatBRL(vinicius?.bonus_calculado ?? 0)}`)
  linhas.push(`• Emanuel: ${formatBRL(emanuel?.bonus_calculado ?? 0)}`)
  linhas.push(`• Total: ${formatBRL(totalComissao)}`)
  linhas.push("")
  linhas.push("_Bom trabalho a todos._")

  return sanitizarParaWa(linhas.join("\n"))
}

export function ehUltimoDiaMes(hoje: Date = new Date()): boolean {
  const amanha = new Date(hoje)
  amanha.setDate(hoje.getDate() + 1)
  return amanha.getDate() === 1
}

export { mesAtual, ANO_PADRAO }
