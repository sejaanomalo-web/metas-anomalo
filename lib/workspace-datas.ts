// =============================================================================
// Workspace — datas. Funções PURAS (sem I/O), usadas no server e no client.
// =============================================================================
//
// Toda data de prazo é uma STRING 'YYYY-MM-DD' — nunca um Date, nunca um
// timestamptz. Motivo: o servidor da Vercel roda em UTC e a operação é 100%
// BRT (America/Sao_Paulo, UTC-3). Se o prazo fosse timestamptz, uma tarefa de
// "hoje 21h" viraria "amanhã" pra quem olhasse do servidor, e o calendário
// mostraria a tarefa no dia errado. Comparando string com string isso não
// existe.
//
// A ÚNICA conversão delicada é descobrir "que dia é hoje em São Paulo" a
// partir do relógio UTC do servidor — feita em hojeISO() via Intl, que já
// conhece o histórico de horário de verão do Brasil.

/** 'YYYY-MM-DD' de hoje no fuso de São Paulo, olhando de qualquer servidor. */
export function hojeISO(agora: Date = new Date()): string {
  // en-CA formata como 'YYYY-MM-DD', que é exatamente o que queremos.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(agora)
}

/** Soma dias a uma data ISO, sem passar por Date local (evita drift). */
export function somarDiasISO(iso: string, dias: number): string {
  const [a, m, d] = iso.split("-").map(Number)
  // Date.UTC + getUTC* mantém a aritmética fora de qualquer fuso.
  const t = Date.UTC(a, m - 1, d) + dias * 86_400_000
  const dt = new Date(t)
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0")
  const dd = String(dt.getUTCDate()).padStart(2, "0")
  return `${dt.getUTCFullYear()}-${mm}-${dd}`
}

/** Diferença em dias entre duas datas ISO (b - a). Negativo = b antes de a. */
export function diffDiasISO(a: string, b: string): number {
  const [a1, m1, d1] = a.split("-").map(Number)
  const [a2, m2, d2] = b.split("-").map(Number)
  return Math.round(
    (Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000
  )
}

export function ehDataISOValida(v: unknown): v is string {
  if (typeof v !== "string") return false
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const [a, m, d] = v.split("-").map(Number)
  if (m < 1 || m > 12 || d < 1 || d > 31) return false
  // rejeita 2026-02-31 e afins
  const dt = new Date(Date.UTC(a, m - 1, d))
  return dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

/** 'HH:MM' ou 'HH:MM:SS' → 'HH:MM'. null se inválido/vazio. */
export function normalizarHora(v: string | null | undefined): string | null {
  if (!v) return null
  const s = v.trim()
  const m = /^(\d{2}):(\d{2})(:\d{2})?$/.exec(s)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return `${m[1]}:${m[2]}`
}

// ============================================================
// Classificação de prazo (é o que a lista e "Minhas tarefas" usam)
// ============================================================

export type SituacaoPrazo =
  | "sem_prazo"
  | "atrasada"
  | "hoje"
  | "amanha"
  | "proximos_7"
  | "futura"

export function situacaoPrazo(
  prazoEm: string | null,
  hoje: string = hojeISO()
): SituacaoPrazo {
  if (!prazoEm) return "sem_prazo"
  const d = diffDiasISO(hoje, prazoEm)
  if (d < 0) return "atrasada"
  if (d === 0) return "hoje"
  if (d === 1) return "amanha"
  if (d <= 7) return "proximos_7"
  return "futura"
}

/** Rótulo curto pra chip de prazo. Sempre acompanha a cor — cor sozinha não
 *  é acessível pra quem não distingue vermelho/verde. */
export function rotuloPrazo(
  prazoEm: string | null,
  hoje: string = hojeISO()
): string {
  if (!prazoEm) return "Sem prazo"
  const d = diffDiasISO(hoje, prazoEm)
  if (d === 0) return "Hoje"
  if (d === 1) return "Amanhã"
  if (d === -1) return "Atrasada 1 dia"
  if (d < 0) return `Atrasada ${-d} dias`
  if (d <= 7) return `Em ${d} dias`
  return formatarDataBR(prazoEm)
}

/** 'YYYY-MM-DD' → 'DD/MM/YYYY'. Puro string-slicing, sem Date. */
export function formatarDataBR(iso: string): string {
  const [a, m, d] = iso.split("-")
  return `${d}/${m}/${a}`
}

/** 'YYYY-MM-DD' → 'DD/MM' (chips compactos). */
export function formatarDataCurtaBR(iso: string): string {
  const [, m, d] = iso.split("-")
  return `${d}/${m}`
}

// ============================================================
// Recorrência — próxima data de uma regra
// ============================================================

import type { Recorrencia } from "./workspace-tipos"

/**
 * Próxima ocorrência DEPOIS de `base` ('YYYY-MM-DD'), segundo a regra.
 * Mensal/anual fixam o dia do mês da base e recuam pro último dia quando o
 * mês alvo é mais curto (31/jan → 28/fev, nunca 03/mar).
 */
export function proximaOcorrencia(base: string, rec: Recorrencia): string {
  const [a, m, d] = base.split("-").map(Number)
  switch (rec.freq) {
    case "diaria":
      return somarDiasISO(base, 1)
    case "semanal": {
      const dias = rec.dias && rec.dias.length > 0 ? rec.dias : null
      if (!dias) return somarDiasISO(base, 7)
      const dowBase = new Date(Date.UTC(a, m - 1, d)).getUTCDay()
      // Menor salto de 1..7 dias que cai num dia permitido.
      for (let salto = 1; salto <= 7; salto++) {
        if (dias.includes((dowBase + salto) % 7)) return somarDiasISO(base, salto)
      }
      return somarDiasISO(base, 7)
    }
    case "mensal": {
      const alvoAno = m === 12 ? a + 1 : a
      const alvoMes = m === 12 ? 1 : m + 1
      const ultimo = new Date(Date.UTC(alvoAno, alvoMes, 0)).getUTCDate()
      const dia = Math.min(d, ultimo)
      return `${alvoAno}-${String(alvoMes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`
    }
    case "anual": {
      const ultimo = new Date(Date.UTC(a + 1, m, 0)).getUTCDate()
      const dia = Math.min(d, ultimo)
      return `${a + 1}-${String(m).padStart(2, "0")}-${String(dia).padStart(2, "0")}`
    }
  }
}

// ============================================================
// Grade do calendário mensal
// ============================================================

export const NOMES_MES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
] as const

export const DIAS_SEMANA_CURTO = ["D", "S", "T", "Q", "Q", "S", "S"] as const

/** Primeiro e último dia do mês em ISO — a janela que o calendário busca. */
export function rangeDoMes(ano: number, mes1a12: number): {
  inicio: string
  fim: string
} {
  const mm = String(mes1a12).padStart(2, "0")
  const ultimo = new Date(Date.UTC(ano, mes1a12, 0)).getUTCDate()
  return {
    inicio: `${ano}-${mm}-01`,
    fim: `${ano}-${mm}-${String(ultimo).padStart(2, "0")}`,
  }
}

export interface CelulaCalendario {
  /** 'YYYY-MM-DD' */
  iso: string
  dia: number
  /** false para os dias de preenchimento do mês anterior/seguinte */
  doMes: boolean
}

/**
 * Grade 7×N (sempre começando no domingo) cobrindo o mês inteiro, incluindo
 * os dias vizinhos que completam a primeira e a última semana.
 */
export function gradeDoMes(ano: number, mes1a12: number): CelulaCalendario[] {
  const primeiroDiaSemana = new Date(Date.UTC(ano, mes1a12 - 1, 1)).getUTCDay()
  const diasNoMes = new Date(Date.UTC(ano, mes1a12, 0)).getUTCDate()
  const celulas: CelulaCalendario[] = []

  const inicio = `${ano}-${String(mes1a12).padStart(2, "0")}-01`

  // Dias do mês anterior que preenchem a primeira semana.
  for (let i = primeiroDiaSemana; i > 0; i--) {
    const iso = somarDiasISO(inicio, -i)
    celulas.push({ iso, dia: Number(iso.slice(8, 10)), doMes: false })
  }
  // Dias do mês.
  for (let d = 0; d < diasNoMes; d++) {
    const iso = somarDiasISO(inicio, d)
    celulas.push({ iso, dia: d + 1, doMes: true })
  }
  // Completa a última semana.
  while (celulas.length % 7 !== 0) {
    const ultimo = celulas[celulas.length - 1].iso
    const iso = somarDiasISO(ultimo, 1)
    celulas.push({ iso, dia: Number(iso.slice(8, 10)), doMes: false })
  }
  return celulas
}

/** Mês anterior / seguinte, para os botões de navegação do calendário. */
export function mesAnterior(ano: number, mes: number): { ano: number; mes: number } {
  return mes === 1 ? { ano: ano - 1, mes: 12 } : { ano, mes: mes - 1 }
}

export function mesSeguinte(ano: number, mes: number): { ano: number; mes: number } {
  return mes === 12 ? { ano: ano + 1, mes: 1 } : { ano, mes: mes + 1 }
}

// ============================================================
// Semana — a visão padrão do calendário (zoom "Semanas" do Asana)
// ============================================================

/** Cabeçalhos das colunas da semana, como o Asana em pt: DOM…SÁB. */
export const DIAS_SEMANA_LONGO = [
  "DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB",
] as const

/** Domingo da semana que contém a data dada ('YYYY-MM-DD'). */
export function inicioDaSemana(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number)
  const dow = new Date(Date.UTC(a, m - 1, d)).getUTCDay()
  return somarDiasISO(iso, -dow)
}

/** Os 7 dias (dom→sáb) a partir do domingo dado. */
export function diasDaSemana(domingoIso: string): string[] {
  return Array.from({ length: 7 }, (_, i) => somarDiasISO(domingoIso, i))
}

/**
 * Rótulo do topo do calendário semanal, ex.: "Julho 2026". Se a semana cruza
 * a virada do mês, vale o mês que tem MAIS dias na semana (regra do Asana).
 */
export function rotuloMesDaSemana(domingoIso: string): string {
  const dias = diasDaSemana(domingoIso)
  const contagem = new Map<string, number>()
  for (const d of dias) {
    const chave = d.slice(0, 7)
    contagem.set(chave, (contagem.get(chave) ?? 0) + 1)
  }
  let melhor = dias[0].slice(0, 7)
  let max = 0
  for (const [chave, n] of contagem) {
    if (n > max) {
      max = n
      melhor = chave
    }
  }
  const [ano, mes] = melhor.split("-").map(Number)
  return `${NOMES_MES[mes - 1]} ${ano}`
}
