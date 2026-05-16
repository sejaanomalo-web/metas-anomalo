// Helpers de leitura para o agente Sentinela Anomalo.
//
// O agente roda 2x/dia (09:00 e 15:00 BRT) lendo Meta Ads de cada
// empresa em tokens_meta e gravando o resultado em dados_diarios_log
// com preenchedor_nome='Sentinela Anomalo'. Os campos manuais
// (reuniões, contratos, faturamento, etc.) NÃO são tocados.
//
// Sem 'use server': há funções async (que rodam no servidor a partir
// de Server Components) misturadas com utilitários síncronos puros.

import { getSupabase } from "./supabase"

export const SENTINELA_NOME = "Sentinela Anomalo"

/** Empresas atualmente cobertas pelo agente Sentinela (têm token Meta
 *  cadastrado em tokens_meta e estão ativas). Como o dashboard usa
 *  empresas_config.nome (não slug), mantemos a lista pelo nome de
 *  exibição — bate com o que o agente grava em dados_diarios_log.empresa.
 */
export const EMPRESAS_TRACKEADAS = [
  "Anômalo Hub",
  "Aton Estofados",
  "Diego Knebel",
  "F2 Sports",
  "IBB",
  "Mãe Divina Yoga",
] as const

export function empresaTrackeadaPeloSentinela(nomeEmpresa: string): boolean {
  return (EMPRESAS_TRACKEADAS as readonly string[]).includes(nomeEmpresa)
}

/** Próxima execução do Sentinela em hora BRT (cron 09:00 e 15:00).
 *  Devolve { hora, label } — usado pra mostrar "próxima execução: 15:00". */
export function proximaExecucao(agora: Date = new Date()): {
  hora: number
  minuto: number
  label: string
} {
  // Hora atual em BRT (UTC-3, sem DST).
  const utcMs = agora.getTime() + agora.getTimezoneOffset() * 60_000
  const brt = new Date(utcMs - 3 * 60 * 60_000)
  const h = brt.getHours()
  // antes das 09 → próxima é hoje 09; entre 09 e 15 → hoje 15; depois → amanhã 09.
  const proximaHora = h < 9 ? 9 : h < 15 ? 15 : 9
  return {
    hora: proximaHora,
    minuto: 0,
    label: `${String(proximaHora).padStart(2, "0")}:00 BRT`,
  }
}

/** Quanto tempo passou desde uma timestamp ISO, em formato humano curto. */
export function tempoDecorrido(iso: string | null | undefined): string {
  if (!iso) return "—"
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 0) return "agora"
  const min = Math.floor(ms / 60_000)
  if (min < 1) return "agora"
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  return `${d}d`
}

/** Status do Sentinela com base no último log: cor + rótulo. */
export type StatusSentinela = "ok" | "atencao" | "falha" | "sem_dados"

export function statusSentinela(
  ultimoLog: LogSentinela | null
): {
  status: StatusSentinela
  cor: "success" | "warning" | "danger" | "neutral"
  rotulo: string
} {
  if (!ultimoLog || !ultimoLog.data_execucao) {
    return { status: "sem_dados", cor: "neutral", rotulo: "Sem execuções" }
  }
  const idadeMs = Date.now() - new Date(ultimoLog.data_execucao).getTime()
  const idadeHoras = idadeMs / (1000 * 60 * 60)
  if (ultimoLog.status === "falha" || idadeHoras > 24) {
    return { status: "falha", cor: "danger", rotulo: "Sentinela com falha" }
  }
  if (ultimoLog.status === "parcial" || idadeHoras > 6) {
    return { status: "atencao", cor: "warning", rotulo: "Sentinela atrasado" }
  }
  return { status: "ok", cor: "success", rotulo: "Sentinela conectado" }
}

// ============================================================
// Tipos da tabela dados_diarios_log (subset relevante p/ Sentinela)
// ============================================================
export interface DiaSentinela {
  data: string // ISO date (YYYY-MM-DD)
  investimento_real: number | null
  leads_real: number | null
  cpl_real: number | null
  preenchedor_nome: string | null
  created_at: string
  /** True se o dia é hoje (dado parcial — vai mudar na próxima execução). */
  parcial?: boolean
}

export interface LogSentinela {
  id: number
  data_execucao: string
  status: string
  total_contas_processadas: number
  total_contas_falhas: number
  investimento_total: number | null
  leads_totais: number | null
  cpl_medio_ponderado: number | null
  anomalias_detectadas: AnomaliaSentinela[] | null
  contas_sem_atividade: { empresa: string }[] | null
  erros_de_leitura: { empresa: string; error: string }[] | null
}

export interface AnomaliaSentinela {
  empresa: string
  tipo: "positiva" | "negativa" | "critica"
  metrica: string
  valor_atual: number
  media_7dias: number
  variacao_percentual: number
}

// ============================================================
// Queries
// ============================================================

/** Histórico diário do Sentinela pra uma empresa no mês dado.
 *  Marca como `parcial=true` o dia de hoje (será sobrescrito pela
 *  próxima execução). */
export async function getDiasSentinelaDaEmpresa(
  empresaNome: string,
  inicio: string,
  fim: string
): Promise<DiaSentinela[]> {
  const supabase = getSupabase()
  if (!supabase) return []
  const { data, error } = await supabase
    .from("dados_diarios_log")
    .select(
      "data, investimento_real, leads_real, cpl_real, preenchedor_nome, created_at"
    )
    .eq("empresa", empresaNome)
    .eq("origem", "pago")
    .eq("preenchedor_nome", SENTINELA_NOME)
    .gte("data", inicio)
    .lte("data", fim)
    .order("data", { ascending: true })
  if (error) {
    console.error("[sentinela] getDiasSentinelaDaEmpresa error", error.message)
    return []
  }
  const hojeISO = new Date().toISOString().slice(0, 10)
  return (data ?? []).map((d) => ({
    ...d,
    parcial: d.data === hojeISO,
  })) as DiaSentinela[]
}

/** Linhas do dia (qualquer preenchedor) — usado pra mostrar quem
 *  preencheu o quê (Sentinela 🤖 ou manual 👤). Inclui campos manuais. */
export async function getLinhasDoMes(
  empresaNome: string,
  inicio: string,
  fim: string
): Promise<LinhaDoMes[]> {
  const supabase = getSupabase()
  if (!supabase) return []
  const { data, error } = await supabase
    .from("dados_diarios_log")
    .select(
      "data, investimento_real, leads_real, cpl_real, reunioes_real, contratos_real, faturamento_real, preenchedor_nome, created_at"
    )
    .eq("empresa", empresaNome)
    .eq("origem", "pago")
    .gte("data", inicio)
    .lte("data", fim)
    .order("data", { ascending: false })
  if (error) {
    console.error("[sentinela] getLinhasDoMes error", error.message)
    return []
  }
  return (data ?? []) as LinhaDoMes[]
}

export interface LinhaDoMes {
  data: string
  investimento_real: number | null
  leads_real: number | null
  cpl_real: number | null
  reunioes_real: number | null
  contratos_real: number | null
  faturamento_real: number | null
  preenchedor_nome: string | null
  created_at: string
}

/** Último log de execução do Sentinela (qualquer empresa). */
export async function getUltimoLogSentinela(): Promise<LogSentinela | null> {
  const supabase = getSupabase()
  if (!supabase) return null
  const { data, error } = await supabase
    .from("logs_sentinela")
    .select("*")
    .order("data_execucao", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) {
    console.error("[sentinela] getUltimoLogSentinela error", error.message)
    return null
  }
  return data as LogSentinela | null
}

// ============================================================
// Agregações em memória (pra UI)
// ============================================================

export interface ResumoMesSentinela {
  investimento: number
  leads: number
  cpl: number | null
  dias: number
  diasParciais: number
  ultimaExecucao: string | null
}

export function resumirMesSentinela(dias: DiaSentinela[]): ResumoMesSentinela {
  let investimento = 0
  let leads = 0
  let ultimaExecucao: string | null = null
  for (const d of dias) {
    investimento += Number(d.investimento_real ?? 0)
    leads += Number(d.leads_real ?? 0)
    if (
      d.created_at &&
      (!ultimaExecucao || d.created_at > ultimaExecucao)
    ) {
      ultimaExecucao = d.created_at
    }
  }
  return {
    investimento,
    leads,
    cpl: leads > 0 ? investimento / leads : null,
    dias: dias.length,
    diasParciais: dias.filter((d) => d.parcial).length,
    ultimaExecucao,
  }
}
