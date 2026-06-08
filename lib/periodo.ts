import {
  ANO_PADRAO,
  MESES,
  anoValido,
  mesAtual,
  mesValido,
  type Ano,
  type Mes,
} from "./data"

/**
 * Período global unificado do dashboard.
 *
 * Substitui o par solto (mes, ano) por uma abstração de INTERVALO que
 * cobre três modos selecionáveis no topo (SeletorPeriodoGlobal):
 *
 *   • "mes"       → mês/ano fechado (comportamento legado). de = 1º dia,
 *                   ate = último dia do mês.
 *   • "dia"       → um dia exato. de = ate = dia.
 *   • "intervalo" → "de tal dia a tal dia" (estilo Facebook). Abrange
 *                   dia/mês/meses/ano arbitrário.
 *
 * O estado vive na URL (?de=&ate=&modo=) — mesmo padrão URL-driven do
 * SeletorPeriodo antigo, então sincroniza naturalmente entre todas as
 * interfaces sem Context/Zustand. Mantemos mes/ano DERIVADOS para
 * retrocompatibilidade: quando modo==='mes', as funções mensais
 * existentes (getResumoMensalPorEmpresa etc) continuam valendo; nos
 * modos dia/intervalo as páginas usam as variantes por intervalo
 * (getResumoPorIntervalo*).
 */

export type ModoPeriodo = "mes" | "dia" | "intervalo"

const MES_NUM: Record<Mes, number> = {
  Abril: 4,
  Maio: 5,
  Junho: 6,
  Julho: 7,
  Agosto: 8,
  Setembro: 9,
  Outubro: 10,
  Novembro: 11,
  Dezembro: 12,
}

const NOMES_MES_PT_CURTO: Record<number, string> = {
  1: "jan",
  2: "fev",
  3: "mar",
  4: "abr",
  5: "mai",
  6: "jun",
  7: "jul",
  8: "ago",
  9: "set",
  10: "out",
  11: "nov",
  12: "dez",
}

export interface Periodo {
  modo: ModoPeriodo
  /** Início do intervalo, inclusivo. Formato YYYY-MM-DD. */
  de: string
  /** Fim do intervalo, inclusivo. Formato YYYY-MM-DD. */
  ate: string
  /** Mês representativo (para retrocompat e metas). Modo 'mes': o mês
   *  selecionado. Modo 'dia'/'intervalo': o mês do início. */
  mes: Mes
  /** Ano representativo (idem). */
  ano: Ano
  /** Rótulo legível para títulos. */
  rotulo: string
}

function diasNoMes(mes: Mes, ano: number): number {
  return new Date(ano, MES_NUM[mes], 0).getDate()
}

function pad(n: number): string {
  return String(n).padStart(2, "0")
}

/** Valida YYYY-MM-DD; retorna null se inválido. */
function isoValido(s: string | undefined | null): string | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const [a, m, d] = s.split("-").map((x) => parseInt(x, 10))
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  return s
}

/** Mes/Ano de uma data ISO. Mês fora da janela (Jan/Fev/Mar) cai em Abril. */
function mesAnoDeISO(iso: string): { mes: Mes; ano: Ano } {
  const ano = anoValido(iso.slice(0, 4))
  const m = parseInt(iso.slice(5, 7), 10)
  let mes: Mes = "Abril"
  for (const mm of MESES) {
    if (MES_NUM[mm] === m) {
      mes = mm
      break
    }
  }
  return { mes, ano }
}

function rotuloDia(iso: string): string {
  const d = parseInt(iso.slice(8, 10), 10)
  const m = parseInt(iso.slice(5, 7), 10)
  return `${pad(d)} ${NOMES_MES_PT_CURTO[m] ?? ""}`
}

/**
 * Lê o período a partir dos searchParams da página. Fonte única de
 * verdade. Aceita tanto o novo formato (?de=&ate=&modo=) quanto o legado
 * (?mes=&ano=). Default = mês/ano corrente (mesma semântica de antes).
 */
export function parsePeriodo(searchParams?: {
  mes?: string
  ano?: string
  de?: string
  ate?: string
  modo?: string
}): Periodo {
  const modoRaw = searchParams?.modo
  const de = isoValido(searchParams?.de)
  const ate = isoValido(searchParams?.ate)

  // Modo dia: precisa de 'de' (usa como dia único).
  if (modoRaw === "dia" && de) {
    const { mes, ano } = mesAnoDeISO(de)
    return { modo: "dia", de, ate: de, mes, ano, rotulo: rotuloDia(de) }
  }

  // Modo intervalo: precisa de de + ate.
  if (modoRaw === "intervalo" && de && ate) {
    const ini = de <= ate ? de : ate
    const fim = de <= ate ? ate : de
    const { mes, ano } = mesAnoDeISO(ini)
    return {
      modo: "intervalo",
      de: ini,
      ate: fim,
      mes,
      ano,
      rotulo: `${rotuloDia(ini)} – ${rotuloDia(fim)}`,
    }
  }

  // Default / modo mes: usa mes+ano (legado) e expande para o mês fechado.
  const mes = mesValido(searchParams?.mes)
  const ano = anoValido(searchParams?.ano)
  const mesNum = pad(MES_NUM[mes])
  const ultimo = pad(diasNoMes(mes, ano))
  return {
    modo: "mes",
    de: `${ano}-${mesNum}-01`,
    ate: `${ano}-${mesNum}-${ultimo}`,
    mes,
    ano,
    rotulo: `${mes} ${ano}`,
  }
}

export function formatarRotuloPeriodo(p: Periodo): string {
  return p.rotulo
}

/**
 * Fator de rateio de metas mensais para o intervalo selecionado. Metas
 * (lib/data.ts, metas_empresa) são projetadas por MÊS cheio. Em modo
 * dia/intervalo exibimos o realizado do range e comparamos com a meta
 * proporcional: fator = nº de dias cobertos no mês representativo ÷ dias
 * do mês. Modo 'mes' → 1 (mês inteiro).
 *
 * Regra (intencionalmente simples): considera apenas o mês representativo
 * (p.mes/p.ano). Intervalos que cruzam vários meses usam o mês do início
 * como base do rateio — suficiente para indicar progresso proporcional
 * sem somar metas de múltiplos meses.
 */
export function fatorRateioMeta(p: Periodo): number {
  if (p.modo === "mes") return 1
  const totalDias = diasNoMes(p.mes, p.ano)
  // Conta dias do intervalo que caem dentro do mês representativo.
  const iniMes = `${p.ano}-${pad(MES_NUM[p.mes])}-01`
  const ultimoDiaMes = `${p.ano}-${pad(MES_NUM[p.mes])}-${pad(totalDias)}`
  const ini = p.de > iniMes ? p.de : iniMes
  const fim = p.ate < ultimoDiaMes ? p.ate : ultimoDiaMes
  if (fim < ini) return 0
  const diaIni = parseInt(ini.slice(8, 10), 10)
  const diaFim = parseInt(fim.slice(8, 10), 10)
  const diasCobertos = diaFim - diaIni + 1
  return Math.max(0, Math.min(1, diasCobertos / totalDias))
}

export { ANO_PADRAO }
