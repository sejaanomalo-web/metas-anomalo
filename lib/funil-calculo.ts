import {
  contratosDoLancamento,
  fonteDoLancamento,
  MAX_CONTRATOS,
  MAX_MESES_CONTRATO,
  MAX_NOME_CLIENTE,
  type ContratoFechado,
  type EtapaFunil,
  type FonteFunil,
  type LancamentoFunil,
} from "./funil-tipos"

/**
 * Regras puras dos funis comerciais: agrupamento, fontes e conversões. O período
 * vem do parsePeriodo global, o mesmo das outras telas.
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

// ── Semana e mês ────────────────────────────────────────────────────────────

/** Domingo da semana da data. A semana vai de segunda a domingo. */
function domingoDaSemana(iso: string): string {
  const diaSemana = paraUTC(iso).getUTCDay() // 0 = domingo
  return somarDias(iso, diaSemana === 0 ? 0 : 7 - diaSemana)
}

function fimDoMes(iso: string): string {
  const ano = parseInt(iso.slice(0, 4), 10)
  const mes = parseInt(iso.slice(5, 7), 10)
  return `${iso.slice(0, 7)}-${pad(ultimoDiaDoMes(ano, mes))}`
}

/** Diferença em dias de `de` até `ate`. */
function diasEntre(de: string, ate: string): number {
  return Math.round((paraUTC(ate).getTime() - paraUTC(de).getTime()) / 86_400_000)
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

type Intervalo = { de: string; ate: string }

export function agrupamentosDisponiveis(p: Intervalo): AgrupamentoFunil[] {
  const dias = diasEntre(p.de, p.ate) + 1
  return AGRUPAMENTOS.map((a) => a.valor).filter((a) =>
    a === "dia" ? dias <= MAX_DIAS_AGRUPAR_POR_DIA : true
  )
}

/** Usa o pedido na URL quando cabe; senão escolhe conforme o tamanho do período. */
export function resolverAgrupamento(
  pedido: string | null | undefined,
  p: Intervalo
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
    else if (agrupamento === "semana") fim = domingoDaSemana(cursor)
    else fim = fimDoMes(cursor)
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
  /** Entrada no 1º mês: soma das 1ªs parcelas. */
  faturamento: number
  /** Soma das parcelas que se repetem depois do 1º mês (contratos de 2+ meses). */
  recorrencia: number
  /** Valor de todos os contratos até o fim: 1ª parcela + demais parcelas. */
  totalContratado: number
  /** Quantos contratos têm valor informado. */
  contratos: number
  /** totalContratado / contratos. null sem contratos. */
  ticketMedio: number | null
  perdidos: number
  /** Valor da última etapa do funil. */
  fechados: number
  /** fechados / (fechados + perdidos). null sem nenhum dos dois. */
  taxaFechamento: number | null
  /** totalContratado / investimento. null sem investimento. */
  retorno: number | null
  /** faturamento (só o 1º mês) / investimento. null sem investimento. */
  retornoPrimeiroMes: number | null
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
  let recorrencia = 0
  let totalContratado = 0
  let contratos = 0
  let perdidos = 0
  const somas = new Map<string, number>(etapas.map((e) => [e.id, 0]))

  for (const l of lancamentos) {
    investimento += numeroSeguro(l.investimento)
    for (const c of contratosDoLancamento(l)) {
      const primeira = numeroSeguro(c.primeira)
      const mensal = numeroSeguro(c.mensal)
      const meses = Math.max(1, Math.floor(numeroSeguro(c.meses)))
      faturamento += primeira
      if (meses > 1) recorrencia += mensal
      totalContratado += primeira + mensal * (meses - 1)
      contratos++
    }
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
    recorrencia,
    totalContratado,
    contratos,
    ticketMedio: contratos > 0 ? totalContratado / contratos : null,
    perdidos,
    fechados,
    taxaFechamento:
      fechados + perdidos > 0 ? fechados / (fechados + perdidos) : null,
    retorno: investimento > 0 ? totalContratado / investimento : null,
    retornoPrimeiroMes: investimento > 0 ? faturamento / investimento : null,
    gargalo,
    registros: lancamentos.length,
  }
}

/** Só os lançamentos da fonte. Sem fonte (null): todos. */
export function filtrarPorFonte(
  lancamentos: LancamentoFunil[],
  fonte: string | null
): LancamentoFunil[] {
  if (!fonte) return lancamentos
  return lancamentos.filter((l) => fonteDoLancamento(l) === fonte)
}

/** Mesma conta para cada fonte, na ordem do funil, para comparar lado a lado. */
export function resumirPorFonte(
  etapas: EtapaFunil[],
  fontes: FonteFunil[],
  lancamentos: LancamentoFunil[]
): { fonte: FonteFunil; resumo: ResumoFunil }[] {
  return fontes.map((fonte) => ({
    fonte,
    resumo: resumirFunil(etapas, filtrarPorFonte(lancamentos, fonte.id)),
  }))
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

const MAX_VALOR_PARCELA = 1e10

/**
 * Valida a lista de contratos que vem do formulário (JSON). Parcela das demais
 * em branco vale o mesmo que a 1ª. Linha sem nenhum valor é ignorada.
 */
export function normalizarContratos(
  bruto: unknown
): { contratos: ContratoFechado[] } | { erro: string } {
  if (bruto === null || bruto === undefined || bruto === "") return { contratos: [] }
  let lista: unknown = bruto
  if (typeof bruto === "string") {
    try {
      lista = JSON.parse(bruto)
    } catch {
      return { erro: "Lista de contratos inválida." }
    }
  }
  if (!Array.isArray(lista)) return { erro: "Lista de contratos inválida." }
  if (lista.length > MAX_CONTRATOS) {
    return { erro: `Limite de ${MAX_CONTRATOS} contratos por lançamento.` }
  }

  const valor = (v: unknown): number | null => {
    if (v === null || v === undefined || v === "") return null
    const n = typeof v === "number" ? v : Number(v)
    return Number.isFinite(n) && n >= 0 && n < MAX_VALOR_PARCELA
      ? Math.round(n * 100) / 100
      : NaN
  }

  const contratos: ContratoFechado[] = []
  for (let i = 0; i < lista.length; i++) {
    const item = lista[i] as Record<string, unknown> | null
    if (!item || typeof item !== "object") return { erro: "Lista de contratos inválida." }
    const n = i + 1
    const primeira = valor(item.primeira)
    const mensalBruta = valor(item.mensal)
    if (Number.isNaN(primeira) || Number.isNaN(mensalBruta)) {
      return { erro: `Valor inválido no contrato ${n}.` }
    }
    if (primeira === null && mensalBruta === null) continue
    const meses = Number(item.meses)
    if (!Number.isInteger(meses) || meses < 1 || meses > MAX_MESES_CONTRATO) {
      return { erro: `No contrato ${n}, informe de 1 a ${MAX_MESES_CONTRATO} meses.` }
    }
    const p = primeira ?? 0
    const mensal = meses === 1 ? 0 : mensalBruta ?? p
    if (p === 0 && mensal === 0) continue
    const cliente =
      typeof item.cliente === "string"
        ? item.cliente.trim().slice(0, MAX_NOME_CLIENTE)
        : ""
    contratos.push({ ...(cliente ? { cliente } : {}), primeira: p, mensal, meses })
  }
  return { contratos }
}
