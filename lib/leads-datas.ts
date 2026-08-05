// =============================================================================
// Períodos do dashboard de leads — tudo em BRT (America/Sao_Paulo).
// =============================================================================
// Módulo PURO (sem "use server", sem I/O): as funções são síncronas e sem
// efeito, então podem ser importadas tanto por Server Components quanto por
// Client Components (o seletor de filtro roda no cliente).
//
// Por que um módulo próprio em vez de reusar lib/periodo.ts: aquele resolve
// o período GLOBAL do dashboard interno (modos mes/dia/intervalo, preso aos
// meses Abril..Dezembro de ANO_PADRAO por causa das metas). Aqui o público é o
// cliente final, o vocabulário é outro ("ontem", "semana passada") e não há
// limite de meses — leads existem em qualquer data.
//
// Regra de fuso: leads_log.data_brt já é o dia-calendário BRT materializado na
// ingestão, então TODO filtro daqui compara data com data (nunca timestamp),
// e nenhuma conversão acontece na hora da consulta.
//
// Convenção de semana: DOMINGO a SÁBADO, igual ao calendário do Workspace
// (lib/workspace-datas.ts, "grade 7×N sempre começando no domingo").
// =============================================================================

export type ChavePeriodo =
  | "hoje"
  | "ontem"
  | "anteontem"
  | "esta_semana"
  | "semana_passada"
  | "este_mes"
  | "mes_passado"
  | "tudo"

export const PERIODO_PADRAO: ChavePeriodo = "esta_semana"

export interface IntervaloLeads {
  chave: ChavePeriodo
  /** Início inclusivo, YYYY-MM-DD. null = sem limite (chave "tudo"). */
  de: string | null
  /** Fim inclusivo, YYYY-MM-DD. null = sem limite (chave "tudo"). */
  ate: string | null
  /** Rótulo curto pro botão do filtro. */
  rotulo: string
  /** Descrição com as datas, pro cabeçalho ("12/07 a 18/07"). */
  detalhe: string
}

/** Ordem em que os filtros aparecem na tela (do mais recente ao mais amplo). */
export const PERIODOS_ORDEM: ChavePeriodo[] = [
  "hoje",
  "ontem",
  "anteontem",
  "esta_semana",
  "semana_passada",
  "este_mes",
  "mes_passado",
  "tudo",
]

const ROTULOS: Record<ChavePeriodo, string> = {
  hoje: "Hoje",
  ontem: "Ontem",
  anteontem: "Anteontem",
  esta_semana: "Esta semana",
  semana_passada: "Semana passada",
  este_mes: "Este mês",
  mes_passado: "Mês passado",
  tudo: "Tudo",
}

// -----------------------------------------------------------------------------
// Base de datas em BRT
// -----------------------------------------------------------------------------

// en-CA formata como YYYY-MM-DD, que é exatamente o formato do banco. Usar
// Intl (em vez de subtrair 3h de um Date) faz o cálculo pelo tz real, então
// continua correto se o Brasil um dia voltar a ter horário de verão.
const FMT_ISO_BRT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})

/** Dia-calendário BRT de um instante, em YYYY-MM-DD. */
export function diaBRT(ref: Date = new Date()): string {
  return FMT_ISO_BRT.format(ref)
}

/** Quebra 'YYYY-MM-DD' em números, sem passar por Date (evita shift de fuso). */
function partes(iso: string): { ano: number; mes: number; dia: number } {
  const [a, m, d] = iso.split("-").map((x) => parseInt(x, 10))
  return { ano: a, mes: m, dia: d }
}

function pad(n: number): string {
  return String(n).padStart(2, "0")
}

function montar(ano: number, mes: number, dia: number): string {
  return `${ano}-${pad(mes)}-${pad(dia)}`
}

/**
 * Soma (ou subtrai) dias a uma data ISO, operando em UTC puro.
 *
 * Date.UTC + getUTC* nunca sofre shift de fuso nem de horário de verão, porque
 * a data aqui é um RÓTULO de calendário, não um instante. Fazer isso com
 * `new Date(iso)` local quebraria em qualquer máquina a oeste de Greenwich.
 */
export function somarDias(iso: string, dias: number): string {
  const { ano, mes, dia } = partes(iso)
  const d = new Date(Date.UTC(ano, mes - 1, dia))
  d.setUTCDate(d.getUTCDate() + dias)
  return montar(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
}

/** Dia da semana (0 = domingo … 6 = sábado) de uma data ISO, sem fuso. */
export function diaDaSemana(iso: string): number {
  const { ano, mes, dia } = partes(iso)
  return new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay()
}

/** Domingo da semana que contém a data. */
export function domingoDa(iso: string): string {
  return somarDias(iso, -diaDaSemana(iso))
}

/** Primeiro dia do mês da data. */
export function primeiroDiaDoMes(iso: string): string {
  const { ano, mes } = partes(iso)
  return montar(ano, mes, 1)
}

/** Último dia do mês da data. Dia 0 do mês seguinte = último do atual. */
export function ultimoDiaDoMes(iso: string): string {
  const { ano, mes } = partes(iso)
  const d = new Date(Date.UTC(ano, mes, 0))
  return montar(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
}

/** 'YYYY-MM-DD' → 'DD/MM'. */
export function formatarDiaCurto(iso: string): string {
  const { mes, dia } = partes(iso)
  return `${pad(dia)}/${pad(mes)}`
}

/** 'YYYY-MM-DD' → 'DD/MM/YYYY'. */
export function formatarDiaLongo(iso: string): string {
  const { ano, mes, dia } = partes(iso)
  return `${pad(dia)}/${pad(mes)}/${ano}`
}

// -----------------------------------------------------------------------------
// Resolução do período
// -----------------------------------------------------------------------------

/** Aceita só as chaves conhecidas; qualquer outra coisa cai no padrão. */
export function parseChavePeriodo(valor: string | undefined | null): ChavePeriodo {
  if (valor && (PERIODOS_ORDEM as string[]).includes(valor)) {
    return valor as ChavePeriodo
  }
  return PERIODO_PADRAO
}

/**
 * Converte a chave do filtro num intervalo de datas BRT concreto.
 *
 * `hoje` é injetável pra permitir teste determinístico; em produção sempre
 * resolve pelo relógio real em BRT.
 */
export function resolverPeriodo(
  chave: ChavePeriodo,
  hoje: string = diaBRT()
): IntervaloLeads {
  const rotulo = ROTULOS[chave]

  switch (chave) {
    case "hoje":
      return { chave, de: hoje, ate: hoje, rotulo, detalhe: formatarDiaLongo(hoje) }

    case "ontem": {
      const d = somarDias(hoje, -1)
      return { chave, de: d, ate: d, rotulo, detalhe: formatarDiaLongo(d) }
    }

    case "anteontem": {
      const d = somarDias(hoje, -2)
      return { chave, de: d, ate: d, rotulo, detalhe: formatarDiaLongo(d) }
    }

    case "esta_semana": {
      const de = domingoDa(hoje)
      const ate = somarDias(de, 6)
      return {
        chave,
        de,
        ate,
        rotulo,
        detalhe: `${formatarDiaCurto(de)} a ${formatarDiaCurto(ate)}`,
      }
    }

    case "semana_passada": {
      const de = somarDias(domingoDa(hoje), -7)
      const ate = somarDias(de, 6)
      return {
        chave,
        de,
        ate,
        rotulo,
        detalhe: `${formatarDiaCurto(de)} a ${formatarDiaCurto(ate)}`,
      }
    }

    case "este_mes": {
      const de = primeiroDiaDoMes(hoje)
      const ate = ultimoDiaDoMes(hoje)
      return {
        chave,
        de,
        ate,
        rotulo,
        detalhe: `${formatarDiaCurto(de)} a ${formatarDiaCurto(ate)}`,
      }
    }

    case "mes_passado": {
      // Dia 0 do mês atual = último dia do mês anterior. Daí derivo o mês
      // inteiro — evita a armadilha de "subtrair 1 do mês" em janeiro.
      const { ano, mes } = partes(hoje)
      const ultimoAnterior = new Date(Date.UTC(ano, mes - 1, 0))
      const ate = montar(
        ultimoAnterior.getUTCFullYear(),
        ultimoAnterior.getUTCMonth() + 1,
        ultimoAnterior.getUTCDate()
      )
      const de = primeiroDiaDoMes(ate)
      return {
        chave,
        de,
        ate,
        rotulo,
        detalhe: `${formatarDiaCurto(de)} a ${formatarDiaCurto(ate)}`,
      }
    }

    case "tudo":
    default:
      return { chave: "tudo", de: null, ate: null, rotulo: ROTULOS.tudo, detalhe: "Todo o período" }
  }
}
