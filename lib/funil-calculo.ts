import type { EtapaFunil, LancamentoFunil } from "./funil-tipos"

/**
 * Regras puras dos funis comerciais: período, agrupamento e conversões.
 *
 * Não acessa banco nem relógio. "Hoje" sempre chega por parâmetro, o que
 * mantém servidor e cliente de acordo e permite testar qualquer data. Datas são
 * strings YYYY-MM-DD, e a aritmética usa UTC para não sofrer com fuso e horário
 * de verão.
 */

// ── Datas ───────────────────────────────────────────────────────────────────

const NOMES_MES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
]
const MES_CURTO = NOMES_MES.map((m) => m.slice(0, 3).toLowerCase())

function pad(n: number): string {
  return String(n).padStart(2, "0")
}

function paraUTC(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`)
}

function paraISO(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function somarDias(iso: string, dias: number): string {
  const d = paraUTC(iso)
  d.setUTCDate(d.getUTCDate() + dias)
  return paraISO(d)
}

function ultimoDiaDoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate()
}

/** Confere se é uma data que existe de verdade (31/02 não passa). */
export function dataValida(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = paraUTC(s)
  return !Number.isNaN(d.getTime()) && paraISO(d) === s
}

function rotuloCurto(iso: string, comAno = false): string {
  const dia = iso.slice(8, 10)
  const mes = MES_CURTO[parseInt(iso.slice(5, 7), 10) - 1]
  return comAno ? `${dia} ${mes} ${iso.slice(0, 4)}` : `${dia} ${mes}`
}

/** Hoje (YYYY-MM-DD) no fuso da operação. */
export function hojeBRT(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(agora)
}

/** "06 nov 2026", para listas e tabelas. */
export function formatarDataCurta(iso: string): string {
  return rotuloCurto(iso, true)
}

// ── Período ─────────────────────────────────────────────────────────────────

export type ModoPeriodoFunil = "dia" | "semana" | "mes" | "ano" | "intervalo"

export const MODOS_PERIODO: { valor: ModoPeriodoFunil; rotulo: string }[] = [
  { valor: "dia", rotulo: "Dia" },
  { valor: "semana", rotulo: "Semana" },
  { valor: "mes", rotulo: "Mês" },
  { valor: "ano", rotulo: "Ano" },
  { valor: "intervalo", rotulo: "Intervalo" },
]

export interface PeriodoFunil {
  modo: ModoPeriodoFunil
  de: string
  ate: string
  rotulo: string
}

/** Segunda-feira da semana da data. A semana vai de segunda a domingo. */
function segundaDaSemana(iso: string): string {
  const diaSemana = paraUTC(iso).getUTCDay() // 0 = domingo
  return somarDias(iso, diaSemana === 0 ? -6 : 1 - diaSemana)
}

function rotuloIntervalo(de: string, ate: string): string {
  if (de === ate) return rotuloCurto(de, true)
  if (de.slice(0, 7) === ate.slice(0, 7)) {
    return `${de.slice(8, 10)} – ${rotuloCurto(ate, true)}`
  }
  if (de.slice(0, 4) === ate.slice(0, 4)) {
    return `${rotuloCurto(de)} – ${rotuloCurto(ate, true)}`
  }
  return `${rotuloCurto(de, true)} – ${rotuloCurto(ate, true)}`
}

/** Período do modo que contém a data-âncora. Intervalo é um dia só aqui. */
export function periodoDaData(
  modo: ModoPeriodoFunil,
  ancora: string
): PeriodoFunil {
  const ano = parseInt(ancora.slice(0, 4), 10)
  const mes = parseInt(ancora.slice(5, 7), 10)
  switch (modo) {
    case "semana": {
      const de = segundaDaSemana(ancora)
      const ate = somarDias(de, 6)
      return { modo, de, ate, rotulo: rotuloIntervalo(de, ate) }
    }
    case "mes":
      return {
        modo,
        de: `${ano}-${pad(mes)}-01`,
        ate: `${ano}-${pad(mes)}-${pad(ultimoDiaDoMes(ano, mes))}`,
        rotulo: `${NOMES_MES[mes - 1]} ${ano}`,
      }
    case "ano":
      return {
        modo,
        de: `${ano}-01-01`,
        ate: `${ano}-12-31`,
        rotulo: String(ano),
      }
    default:
      return { modo, de: ancora, ate: ancora, rotulo: rotuloCurto(ancora, true) }
  }
}

export function periodoIntervalo(de: string, ate: string): PeriodoFunil {
  const [ini, fim] = de <= ate ? [de, ate] : [ate, de]
  return {
    modo: "intervalo",
    de: ini,
    ate: fim,
    rotulo: rotuloIntervalo(ini, fim),
  }
}

/**
 * Lê o período da URL. Aceita também ?mes=&ano=, formato do seletor global
 * usado nas outras telas, então quem chega de lá cai no mês certo.
 * Sem nada válido: mês corrente.
 */
export function parsePeriodoFunil(
  params: {
    modo?: string
    de?: string
    ate?: string
    mes?: string
    ano?: string
  },
  hoje: string
): PeriodoFunil {
  const de = dataValida(params.de) ? params.de : null
  const ate = dataValida(params.ate) ? params.ate : null
  const modo = params.modo

  if (modo === "intervalo" && de && ate) return periodoIntervalo(de, ate)
  if ((modo === "dia" || modo === "semana" || modo === "mes" || modo === "ano") && de) {
    return periodoDaData(modo, de)
  }

  const idxMes = NOMES_MES.indexOf(params.mes ?? "")
  const ano = parseInt(params.ano ?? "", 10)
  if (idxMes >= 0 && ano >= 2000 && ano <= 2100) {
    return periodoDaData("mes", `${ano}-${pad(idxMes + 1)}-01`)
  }
  return periodoDaData("mes", hoje)
}

/** Período anterior (-1) ou seguinte (+1). Intervalo anda o próprio tamanho. */
export function navegarPeriodo(p: PeriodoFunil, delta: -1 | 1): PeriodoFunil {
  switch (p.modo) {
    case "dia":
      return periodoDaData("dia", somarDias(p.de, delta))
    case "semana":
      return periodoDaData("semana", somarDias(p.de, 7 * delta))
    case "mes": {
      const d = paraUTC(p.de)
      d.setUTCMonth(d.getUTCMonth() + delta)
      return periodoDaData("mes", paraISO(d))
    }
    case "ano":
      return periodoDaData(
        "ano",
        `${parseInt(p.de.slice(0, 4), 10) + delta}-01-01`
      )
    case "intervalo": {
      const dias = diasEntre(p.de, p.ate) + 1
      return periodoIntervalo(
        somarDias(p.de, dias * delta),
        somarDias(p.ate, dias * delta)
      )
    }
  }
}

/** Diferença em dias de `de` até `ate`. */
function diasEntre(de: string, ate: string): number {
  return Math.round((paraUTC(ate).getTime() - paraUTC(de).getTime()) / 86_400_000)
}

/** Parâmetros de URL que representam o período. */
export function periodoParaParams(p: {
  modo: ModoPeriodoFunil
  de: string
  ate: string
}): { modo: string; de: string; ate: string } {
  return { modo: p.modo, de: p.de, ate: p.ate }
}

// ── Agrupamento (evolução: semana a semana etc.) ────────────────────────────

export type AgrupamentoFunil = "dia" | "semana" | "mes"

export const AGRUPAMENTOS: { valor: AgrupamentoFunil; rotulo: string }[] = [
  { valor: "dia", rotulo: "Por dia" },
  { valor: "semana", rotulo: "Por semana" },
  { valor: "mes", rotulo: "Por mês" },
]

/** Acima disto, uma linha por dia deixa de ser legível. */
const MAX_DIAS_AGRUPAR_POR_DIA = 62

export function agrupamentosDisponiveis(p: PeriodoFunil): AgrupamentoFunil[] {
  const dias = diasEntre(p.de, p.ate) + 1
  return AGRUPAMENTOS.map((a) => a.valor).filter((a) =>
    a === "dia" ? dias <= MAX_DIAS_AGRUPAR_POR_DIA : true
  )
}

/** Usa o pedido na URL quando cabe; senão escolhe conforme o tamanho do período. */
export function resolverAgrupamento(
  pedido: string | undefined,
  p: PeriodoFunil
): AgrupamentoFunil {
  const disponiveis = agrupamentosDisponiveis(p)
  if (disponiveis.includes(pedido as AgrupamentoFunil)) {
    return pedido as AgrupamentoFunil
  }
  const dias = diasEntre(p.de, p.ate) + 1
  if (dias <= 14) return "dia"
  return dias <= 92 ? "semana" : "mes"
}

export interface BaldePeriodo {
  de: string
  ate: string
  rotulo: string
}

/** Fatias contíguas do período, recortadas nas pontas. Inclui fatias vazias. */
export function gerarBaldes(
  de: string,
  ate: string,
  agrupamento: AgrupamentoFunil
): BaldePeriodo[] {
  const baldes: BaldePeriodo[] = []
  let cursor = de
  while (cursor <= ate) {
    let fim: string
    if (agrupamento === "dia") fim = cursor
    else if (agrupamento === "semana") fim = periodoDaData("semana", cursor).ate
    else fim = periodoDaData("mes", cursor).ate
    if (fim > ate) fim = ate

    let rotulo: string
    if (agrupamento === "dia" || (agrupamento === "semana" && cursor === fim)) {
      rotulo = rotuloCurto(cursor)
    } else if (agrupamento === "semana") {
      rotulo =
        cursor.slice(0, 7) === fim.slice(0, 7)
          ? `${cursor.slice(8, 10)} – ${rotuloCurto(fim)}`
          : `${rotuloCurto(cursor)} – ${rotuloCurto(fim)}`
    } else {
      const m = parseInt(cursor.slice(5, 7), 10)
      rotulo = `${NOMES_MES[m - 1].slice(0, 3)} ${cursor.slice(0, 4)}`
    }
    baldes.push({ de: cursor, ate: fim, rotulo })
    cursor = somarDias(fim, 1)
  }
  return baldes
}

// ── Conversões ──────────────────────────────────────────────────────────────

export interface EtapaResumo extends EtapaFunil {
  valor: number
  /** valor / etapa anterior. null na 1ª etapa ou com anterior zerada. */
  conversaoAnterior: number | null
  /** valor / 1ª etapa. null com a 1ª etapa zerada. */
  conversaoTopo: number | null
  /** investimento / valor. null sem investimento ou com a etapa zerada. */
  custo: number | null
}

export interface GargaloFunil {
  /** Índice da etapa de destino do pior passo. */
  indice: number
  de: string
  para: string
  taxa: number
}

export interface ResumoFunil {
  etapas: EtapaResumo[]
  investimento: number
  faturamento: number
  perdidos: number
  /** Valor da última etapa do funil. */
  fechados: number
  /** fechados / (fechados + perdidos). null sem nenhum dos dois. */
  taxaFechamento: number | null
  /** faturamento / investimento. null sem investimento. */
  retorno: number | null
  gargalo: GargaloFunil | null
  registros: number
}

function numeroSeguro(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/**
 * Soma os lançamentos e calcula as taxas entre as etapas.
 *
 * Gargalo é o passo com a MENOR conversão, com a etapa anterior maior que zero.
 * No empate vale o passo mais ao topo. Passo em 100% ou mais não é gargalo:
 * como a conta é por período, e não por lead, uma etapa pode superar a anterior
 * quando os números de meses diferentes se misturam.
 */
export function resumirFunil(
  etapas: EtapaFunil[],
  lancamentos: LancamentoFunil[]
): ResumoFunil {
  let investimento = 0
  let faturamento = 0
  let perdidos = 0
  const somas = new Map<string, number>(etapas.map((e) => [e.id, 0]))

  for (const l of lancamentos) {
    investimento += numeroSeguro(l.investimento)
    faturamento += numeroSeguro(l.faturamento)
    perdidos += numeroSeguro(l.perdidos)
    for (const e of etapas) {
      somas.set(e.id, (somas.get(e.id) ?? 0) + numeroSeguro(l.valores?.[e.id]))
    }
  }

  const topo = etapas.length > 0 ? somas.get(etapas[0].id) ?? 0 : 0
  const resumo: EtapaResumo[] = etapas.map((e, i) => {
    const valor = somas.get(e.id) ?? 0
    const anterior = i > 0 ? somas.get(etapas[i - 1].id) ?? 0 : 0
    return {
      ...e,
      valor,
      conversaoAnterior: i > 0 && anterior > 0 ? valor / anterior : null,
      conversaoTopo: topo > 0 ? valor / topo : null,
      custo: investimento > 0 && valor > 0 ? investimento / valor : null,
    }
  })

  let gargalo: GargaloFunil | null = null
  resumo.forEach((e, i) => {
    if (e.conversaoAnterior === null || e.conversaoAnterior >= 1) return
    if (gargalo === null || e.conversaoAnterior < gargalo.taxa) {
      gargalo = {
        indice: i,
        de: resumo[i - 1].nome,
        para: e.nome,
        taxa: e.conversaoAnterior,
      }
    }
  })

  const fechados = resumo.length > 0 ? resumo[resumo.length - 1].valor : 0
  return {
    etapas: resumo,
    investimento,
    faturamento,
    perdidos,
    fechados,
    taxaFechamento:
      fechados + perdidos > 0 ? fechados / (fechados + perdidos) : null,
    retorno: investimento > 0 ? faturamento / investimento : null,
    gargalo,
    registros: lancamentos.length,
  }
}

/** Resumo de cada fatia do período, na ordem cronológica. */
export function evolucaoDoFunil(
  etapas: EtapaFunil[],
  lancamentos: LancamentoFunil[],
  baldes: BaldePeriodo[]
): { balde: BaldePeriodo; resumo: ResumoFunil }[] {
  return baldes.map((balde) => ({
    balde,
    resumo: resumirFunil(
      etapas,
      lancamentos.filter((l) => l.data >= balde.de && l.data <= balde.ate)
    ),
  }))
}

/** "62,5%": até 1 casa decimal. Null vira travessão. */
export function formatarPct(taxa: number | null): string {
  if (taxa === null) return "—"
  return `${new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 1,
  }).format(taxa * 100)}%`
}
