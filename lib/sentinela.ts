// Helpers de leitura para o agente Sentinela Anomalo.
//
// O agente roda 2x/dia (09:00 e 15:00 BRT) lendo Meta Ads de cada
// empresa em tokens_meta e gravando o resultado em dados_diarios_log
// com preenchedor_nome='Sentinela Anomalo'. Os campos manuais
// (reuniões, contratos, faturamento, etc.) NÃO são tocados.
//
// Sem 'use server': há funções async (que rodam no servidor a partir
// de Server Components) misturadas com utilitários síncronos puros.

import { getSupabase, getSupabaseAdmin, type DadosReais } from "./supabase"
import {
  MES_NUM,
  MESES,
  type Mes,
  type OrigemDadosReais,
  diasNoMes,
} from "./data"

export const SENTINELA_NOME = "Sentinela Anomalo"

/** Fallback hardcoded da lista de empresas trackeadas, usado APENAS se
 *  a query a tokens_meta falhar (Supabase fora do ar, env vars não
 *  setadas, etc.). A fonte da verdade é a tabela `tokens_meta` em
 *  produção — adicione clientes lá, não aqui.
 */
const EMPRESAS_TRACKEADAS_FALLBACK = [
  "Anômalo Hub",
  "Tato Estofados",
  "Diego Knebel",
  "F2 Sports",
  "IBB",
  "Mãe Divina Yoga",
] as const

/** Lê dinamicamente as empresas com token Meta ativo cadastrado em
 *  tokens_meta. Resultado ordenado alfabeticamente. Fallback hardcoded
 *  em caso de falha (sem service_role ou query error).
 *
 *  tokens_meta tem RLS sem policies → exige service_role pra ler. Por
 *  isso usa getSupabaseAdmin, não getSupabase. */
export async function getEmpresasTrackeadas(): Promise<string[]> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return [...EMPRESAS_TRACKEADAS_FALLBACK]
  const { data, error } = await supabase
    .from("tokens_meta")
    .select("empresa")
    .eq("ativo", true)
    .order("empresa")
  if (error || !data || data.length === 0) {
    if (error) {
      console.error("[sentinela] tokens_meta query error", error.message)
    }
    return [...EMPRESAS_TRACKEADAS_FALLBACK]
  }
  return data.map((r) => r.empresa as string)
}

export async function empresaTrackeadaPeloSentinela(
  nomeEmpresa: string
): Promise<boolean> {
  const trackeadas = await getEmpresasTrackeadas()
  return trackeadas.includes(nomeEmpresa)
}

/** Formata um ISO datetime no timezone BRT, escolhendo o rótulo mais
 *  curto que ainda é inequívoco:
 *    • mesmo dia que `agora` → "hoje HH:MM"
 *    • dia anterior         → "ontem HH:MM"
 *    • dia seguinte         → "amanhã HH:MM"
 *    • qualquer outro       → "DD/MM HH:MM"
 *  Usado pra exibir "última execução" e "próxima execução" do Sentinela. */
export function formatarMomentoBRT(
  iso: string,
  agora: Date = new Date()
): string {
  const d = new Date(iso)
  const fmtData = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
  })
  const fmtHora = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
  const dataAlvo = fmtData.format(d)
  const horaAlvo = fmtHora.format(d)
  const dataHoje = fmtData.format(agora)
  const dataAmanha = fmtData.format(new Date(agora.getTime() + 86400_000))
  const dataOntem = fmtData.format(new Date(agora.getTime() - 86400_000))

  if (dataAlvo === dataHoje) return `hoje ${horaAlvo}`
  if (dataAlvo === dataAmanha) return `amanhã ${horaAlvo}`
  if (dataAlvo === dataOntem) return `ontem ${horaAlvo}`
  return `${dataAlvo} ${horaAlvo}`
}

/** Próxima execução do Sentinela em hora BRT (cron 09:00 e 15:00).
 *  Devolve hora/minuto pra cálculos, label curto ("15:00 BRT") e
 *  labelCompleto com data ("hoje 15:00 BRT" / "amanhã 09:00 BRT"). */
export function proximaExecucao(agora: Date = new Date()): {
  hora: number
  minuto: number
  label: string
  iso: string
  labelCompleto: string
} {
  // Hora atual em BRT (UTC-3, sem DST).
  const utcMs = agora.getTime() + agora.getTimezoneOffset() * 60_000
  const brt = new Date(utcMs - 3 * 60 * 60_000)
  const h = brt.getHours()
  // antes das 09 → próxima é hoje 09; entre 09 e 15 → hoje 15; depois → amanhã 09.
  const proximaHora = h < 9 ? 9 : h < 15 ? 15 : 9
  // Constrói data/hora exata da próxima execução, em BRT, e volta pra
  // ISO UTC (somando o offset BRT de -3h → -(-3) = +3h pra ir pra UTC).
  const proxBrt = new Date(brt)
  proxBrt.setHours(proximaHora, 0, 0, 0)
  if (h >= 15) proxBrt.setDate(proxBrt.getDate() + 1)
  const proxIso = new Date(proxBrt.getTime() + 3 * 60 * 60_000).toISOString()
  return {
    hora: proximaHora,
    minuto: 0,
    label: `${String(proximaHora).padStart(2, "0")}:00 BRT`,
    iso: proxIso,
    labelCompleto: `${formatarMomentoBRT(proxIso, agora)} BRT`,
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
      "data, investimento_real, leads_real, cpl_real, reunioes_agendadas_real, reunioes_real, contratos_real, faturamento_real, impressoes_real, cliques_real, alcance_real, conversas_real, cpm_real, preenchedor_nome, created_at"
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
  reunioes_agendadas_real?: number | null
  reunioes_real: number | null
  contratos_real: number | null
  faturamento_real: number | null
  // Métricas de anúncio do Meta (via Sentinela). Nulas até o agente popular.
  impressoes_real?: number | null
  cliques_real?: number | null
  alcance_real?: number | null
  conversas_real?: number | null
  cpm_real?: number | null
  // Categoria/destino por campanha (preenchido quando a linha vem de
  // dados_diarios_campanha; nas linhas agregadas fica indefinido).
  categoria?: string | null
  destino?: string | null
  preenchedor_nome: string | null
  created_at: string
}

/**
 * Resumo RICO de tráfego (empresa ou cliente) montado a partir das linhas
 * diárias — alimenta o painel novo (herói + cartões). Soma cumulativos e
 * recalcula derivadas (CPL, CPC, CPM, CTR, frequência, custo/conversa,
 * lucro, ROI) dos totais. Tudo 0/null quando ainda não há dado.
 */
export interface ResumoTrafego {
  investimento: number
  leads: number
  conversas: number
  cliques: number
  alcance: number
  impressoes: number
  reunioesAgendadas: number // agendamentos
  reunioes: number // realizadas
  contratos: number // vendas (qtd)
  faturamento: number
  lucro: number
  roi: number | null
  cpl: number | null
  cpc: number | null
  cpm: number | null
  ctr: number | null // 0..1
  frequencia: number | null
  custoPorConversa: number | null
  dias: number
  diasParciais: number
}

export function resumirTrafego(linhas: LinhaDoMes[]): ResumoTrafego {
  const hojeISO = getHojeISO()
  let investimento = 0,
    leads = 0,
    conversas = 0,
    cliques = 0,
    alcance = 0,
    impressoes = 0,
    reunioesAgendadas = 0,
    reunioes = 0,
    contratos = 0,
    faturamento = 0
  const diasSet = new Set<string>()
  let diasParciais = 0
  for (const l of linhas) {
    investimento += Number(l.investimento_real ?? 0)
    leads += Number(l.leads_real ?? 0)
    conversas += Number(l.conversas_real ?? 0)
    cliques += Number(l.cliques_real ?? 0)
    alcance += Number(l.alcance_real ?? 0)
    impressoes += Number(l.impressoes_real ?? 0)
    reunioesAgendadas += Number(l.reunioes_agendadas_real ?? 0)
    reunioes += Number(l.reunioes_real ?? 0)
    contratos += Number(l.contratos_real ?? 0)
    faturamento += Number(l.faturamento_real ?? 0)
    diasSet.add(l.data)
    if (l.preenchedor_nome === SENTINELA_NOME && l.data === hojeISO) {
      diasParciais += 1
    }
  }
  return {
    investimento,
    leads,
    conversas,
    cliques,
    alcance,
    impressoes,
    reunioesAgendadas,
    reunioes,
    contratos,
    faturamento,
    lucro: faturamento - investimento,
    roi: investimento > 0 ? (faturamento - investimento) / investimento : null,
    cpl: leads > 0 ? investimento / leads : null,
    cpc: cliques > 0 ? investimento / cliques : null,
    cpm: impressoes > 0 ? (investimento / impressoes) * 1000 : null,
    ctr: impressoes > 0 ? cliques / impressoes : null,
    frequencia: alcance > 0 ? impressoes / alcance : null,
    custoPorConversa: conversas > 0 ? investimento / conversas : null,
    dias: diasSet.size,
    diasParciais,
  }
}

function getHojeISO(): string {
  const agora = new Date()
  const utcMs = agora.getTime() + agora.getTimezoneOffset() * 60_000
  return new Date(utcMs - 3 * 60 * 60_000).toISOString().slice(0, 10)
}

/** Primeiro dia (YYYY-MM-DD) do mês 5 meses antes de `ateISO` — janela de
 *  6 meses (incluindo o mês de `ate`) para os gráficos do painel. */
export function inicioJanela6Meses(ateISO: string): string {
  const d = new Date(`${ateISO}T00:00:00Z`)
  const s = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 5, 1))
  return s.toISOString().slice(0, 10)
}

export interface CategoriaDestino {
  categoria: string | null
  destino: string | null
}

/**
 * Categorias/destinos por DIA (de dados_diarios_campanha) para a coluna
 * "Categoria" do histórico. Chaveado por data (YYYY-MM-DD); valores únicos
 * por dia. Vazio enquanto o agente não tiver gravado campanhas. Usa
 * service role (dados_diarios_campanha é RLS sem policy).
 */
export async function getCategoriasPorDia(
  empresaNome: string,
  inicio: string,
  fim: string,
  clienteNome?: string | null
): Promise<Record<string, CategoriaDestino[]>> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return {}
  let q = supabase
    .from("dados_diarios_campanha")
    .select("data, categoria, destino")
    .eq("empresa_nome", empresaNome)
    .eq("origem", "pago")
    .gte("data", inicio)
    .lte("data", fim)
  if (clienteNome) q = q.eq("cliente_nome", clienteNome)
  const { data, error } = await q
  if (error) {
    console.error("[sentinela] getCategoriasPorDia error", error.message)
    return {}
  }
  const out: Record<string, CategoriaDestino[]> = {}
  const visto = new Set<string>()
  for (const r of (data ?? []) as {
    data: string
    categoria: string | null
    destino: string | null
  }[]) {
    if (!r.categoria && !r.destino) continue
    const chave = `${r.data}|${r.categoria ?? ""}|${r.destino ?? ""}`
    if (visto.has(chave)) continue
    visto.add(chave)
    if (!out[r.data]) out[r.data] = []
    out[r.data].push({ categoria: r.categoria, destino: r.destino })
  }
  return out
}

/** Ponto mensal para os gráficos do painel de tráfego. */
export interface SerieMesTrafego {
  mes: string // rótulo curto (ex.: "Abr")
  investimento: number
  conversas: number
  faturamento: number
  agendamentos: number
}

const ROTULO_MES_CURTO: Record<number, string> = {
  1: "Jan",
  2: "Fev",
  3: "Mar",
  4: "Abr",
  5: "Mai",
  6: "Jun",
  7: "Jul",
  8: "Ago",
  9: "Set",
  10: "Out",
  11: "Nov",
  12: "Dez",
}

/**
 * Agrupa linhas diárias por MÊS (YYYY-MM) somando os campos dos gráficos.
 * Retorna ordenado por mês ascendente. Reusa as mesmas linhas
 * (getLinhasDoMes/getLinhasDoMesCliente) buscadas numa janela de meses.
 */
export function serieMensalDeLinhas(linhas: LinhaDoMes[]): SerieMesTrafego[] {
  const porMes = new Map<string, SerieMesTrafego>()
  for (const l of linhas) {
    const ym = l.data.slice(0, 7) // YYYY-MM
    const mesNum = parseInt(l.data.slice(5, 7), 10)
    const atual =
      porMes.get(ym) ??
      ({
        mes: ROTULO_MES_CURTO[mesNum] ?? ym,
        investimento: 0,
        conversas: 0,
        faturamento: 0,
        agendamentos: 0,
      } satisfies SerieMesTrafego)
    atual.investimento += Number(l.investimento_real ?? 0)
    atual.conversas += Number(l.conversas_real ?? 0)
    atual.faturamento += Number(l.faturamento_real ?? 0)
    atual.agendamentos += Number(l.reunioes_real ?? 0)
    porMes.set(ym, atual)
  }
  return Array.from(porMes.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, v]) => v)
}

/** Último log de execução do Sentinela (qualquer empresa).
 *
 * Usa getSupabaseAdmin porque logs_sentinela tem RLS habilitada sem
 * policies — anon retornaria 0 linhas silenciosamente (sem erro), e a
 * UI mostraria "última execução: —" mesmo com logs presentes. */
export async function getUltimoLogSentinela(): Promise<LogSentinela | null> {
  const supabase = getSupabaseAdmin()
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

// ============================================================
// Resumo mensal por empresa — fonte unificada pro dashboard
// ============================================================
//
// Agrega TODAS as linhas (Sentinela + manuais) de dados_diarios_log
// num resumo mensal por empresa. Substitui as leituras de dados_reais
// no dashboard:
//
//   • /dashboard           → getResumoMensalPorEmpresa
//   • /dashboard/empresas  → getResumoMensalPorEmpresa
//   • /dashboard/[empresa] → getResumoMensalDaEmpresa + getResumoAnualDaEmpresa
//                            (+ adapter resumoComoDadosReais)
//
// dados_reais segue existindo: o drawer "Inserir dados reais" continua
// escrevendo lá via gravarDadosReaisComLog (que também loga em
// dados_diarios_log). A LEITURA do dashboard, porém, vem 100% dos logs
// — assim o Sentinela (que só toca dados_diarios_log) aparece.
//
// Regras de agregação (uma linha por (empresa, data, origem) garantida
// pelo UNIQUE):
//   • Cumulativos → SOMA das linhas no mês
//     (investimento_real, leads_real, faturamento_real, reunioes_real,
//      contratos_real, criativos_entregues, respostas)
//   • Snapshots   → ÚLTIMO valor não-null
//     (criativos_usados, clientes_ativos, observacoes)
//   • Razões      → RECALCULADAS dos totais
//     (cpl = soma_invest / soma_leads; cpa = soma_invest / soma_contratos)
//   • Jsonb       → não agregamos (vai vazio); criativos_detalhe e
//     publicos_prospectados ficam pra views especializadas (timeline).

export interface ResumoEmpresaMes {
  empresa: string
  investimento: number
  leads: number
  reunioes: number
  contratos: number
  faturamento: number
  criativosEntregues: number
  criativosUsados: number | null
  clientesAtivos: number | null
  cplReal: number | null
  cpaReal: number | null
  // CPM = (investimento / impressões) * 1000. Calculado pelo agregar
  // ponderado por impressões. NULL enquanto o Sentinela não popular
  // impressoes_real (campo recém-adicionado em dados_diarios_log).
  cpmReal: number | null
  impressoes: number
  observacoes: string | null
  respostas: number
  temSentinela: boolean
  // Métricas de anúncio do Meta (via Sentinela). Cumulativos somados;
  // derivadas recalculadas dos totais. Nulas/0 até o agente popular.
  cliques: number
  alcance: number
  conversas: number
  frequencia: number | null // impressoes / alcance
  ctr: number | null // cliques / impressoes (0..1)
  cpc: number | null // investimento / cliques
  custoPorConversa: number | null // investimento / conversas
  // Métricas de negócio derivadas.
  lucro: number // faturamento - investimento
  roi: number | null // (faturamento - investimento) / investimento
}

/** Range YYYY-MM-DD do mês/ano selecionado (lte fim para incluir o último dia). */
function rangeDoMesISO(
  mes: Mes,
  ano: number
): { inicio: string; fim: string } {
  const mesNum = String(MES_NUM[mes]).padStart(2, "0")
  const ultimoDia = String(diasNoMes(mes, ano)).padStart(2, "0")
  return {
    inicio: `${ano}-${mesNum}-01`,
    fim: `${ano}-${mesNum}-${ultimoDia}`,
  }
}

/** Inverso de MES_NUM: data ISO → Mes (Abril..Dezembro) ou null se mês
 *  cair fora da nossa janela (Jan/Fev/Mar). */
function dataISOParaMes(isoDate: string): Mes | null {
  const m = parseInt(isoDate.slice(5, 7), 10)
  if (!Number.isFinite(m)) return null
  for (const mes of MESES) {
    if (MES_NUM[mes] === m) return mes
  }
  return null
}

/** Subset das colunas de dados_diarios_log que precisamos pra agregar. */
interface LinhaAgregavel {
  empresa: string
  data: string
  investimento_real: number | null
  leads_real: number | null
  reunioes_real: number | null
  contratos_real: number | null
  faturamento_real: number | null
  criativos_entregues: number | null
  criativos_usados: number | null
  clientes_ativos: number | null
  observacoes: string | null
  respostas: number | null
  preenchedor_nome: string | null
  // Campos automáticos do Sentinela (Meta Insights API). Nulos até o
  // agente passar a coletar.
  impressoes_real: number | null
  cpm_real: number | null
  cliques_real: number | null
  alcance_real: number | null
  conversas_real: number | null
}

const COLUNAS_AGREGAR =
  "empresa, data, investimento_real, leads_real, reunioes_real, contratos_real, faturamento_real, criativos_entregues, criativos_usados, clientes_ativos, observacoes, respostas, preenchedor_nome, impressoes_real, cpm_real, cliques_real, alcance_real, conversas_real"

/** Agrega uma lista de linhas (mesma empresa, mesmo mês) num resumo. */
function agregarLinhas(
  empresa: string,
  linhas: LinhaAgregavel[]
): ResumoEmpresaMes {
  let investimento = 0
  let leads = 0
  let reunioes = 0
  let contratos = 0
  let faturamento = 0
  let criativosEntregues = 0
  let respostas = 0
  let impressoes = 0
  let cliques = 0
  let alcance = 0
  let conversas = 0
  let criativosUsados: number | null = null
  let clientesAtivos: number | null = null
  let observacoes: string | null = null
  let temSentinela = false

  // Ordena por data DESC pra pegar o ÚLTIMO valor não-null de snapshots
  // sem precisar checar timestamps depois.
  const ordenadas = [...linhas].sort((a, b) => b.data.localeCompare(a.data))

  for (const l of ordenadas) {
    investimento += Number(l.investimento_real ?? 0)
    leads += Number(l.leads_real ?? 0)
    reunioes += Number(l.reunioes_real ?? 0)
    contratos += Number(l.contratos_real ?? 0)
    faturamento += Number(l.faturamento_real ?? 0)
    criativosEntregues += Number(l.criativos_entregues ?? 0)
    respostas += Number(l.respostas ?? 0)
    impressoes += Number(l.impressoes_real ?? 0)
    cliques += Number(l.cliques_real ?? 0)
    alcance += Number(l.alcance_real ?? 0)
    conversas += Number(l.conversas_real ?? 0)

    if (criativosUsados === null && l.criativos_usados != null) {
      criativosUsados = l.criativos_usados
    }
    if (clientesAtivos === null && l.clientes_ativos != null) {
      clientesAtivos = l.clientes_ativos
    }
    if (
      observacoes === null &&
      l.observacoes &&
      l.observacoes.trim().length > 0
    ) {
      observacoes = l.observacoes
    }
    if (l.preenchedor_nome === SENTINELA_NOME) {
      temSentinela = true
    }
  }

  return {
    empresa,
    investimento,
    leads,
    reunioes,
    contratos,
    faturamento,
    criativosEntregues,
    criativosUsados,
    clientesAtivos,
    cplReal: leads > 0 ? investimento / leads : null,
    cpaReal: contratos > 0 ? investimento / contratos : null,
    // CPM ponderado por impressões: total_invest / total_impr * 1000.
    // Enquanto Sentinela não popular impressoes_real, todas as linhas
    // têm impressoes_real=null → soma=0 → cpmReal=null.
    cpmReal: impressoes > 0 ? (investimento / impressoes) * 1000 : null,
    impressoes,
    observacoes,
    respostas,
    temSentinela,
    cliques,
    alcance,
    conversas,
    frequencia: alcance > 0 ? impressoes / alcance : null,
    ctr: impressoes > 0 ? cliques / impressoes : null,
    cpc: cliques > 0 ? investimento / cliques : null,
    custoPorConversa: conversas > 0 ? investimento / conversas : null,
    lucro: faturamento - investimento,
    roi: investimento > 0 ? (faturamento - investimento) / investimento : null,
  }
}

/** Map<empresaNome, resumo> de TODAS as empresas no mês. */
export async function getResumoMensalPorEmpresa(
  mes: Mes,
  ano: number,
  origem: OrigemDadosReais = "pago"
): Promise<Map<string, ResumoEmpresaMes>> {
  const supabase = getSupabase()
  if (!supabase) return new Map()
  const { inicio, fim } = rangeDoMesISO(mes, ano)
  const { data, error } = await supabase
    .from("dados_diarios_log")
    .select(COLUNAS_AGREGAR)
    .eq("origem", origem)
    .gte("data", inicio)
    .lte("data", fim)
  if (error) {
    console.error("[sentinela] getResumoMensalPorEmpresa error", error.message)
    return new Map()
  }
  const porEmpresa = new Map<string, LinhaAgregavel[]>()
  for (const l of (data ?? []) as LinhaAgregavel[]) {
    const lista = porEmpresa.get(l.empresa)
    if (lista) lista.push(l)
    else porEmpresa.set(l.empresa, [l])
  }
  const resultado = new Map<string, ResumoEmpresaMes>()
  for (const [empresa, linhas] of porEmpresa) {
    resultado.set(empresa, agregarLinhas(empresa, linhas))
  }
  return resultado
}

/** Resumo mensal de UMA empresa. Retorna null se não houver nenhuma
 *  linha no mês (estado vazio fica explícito). */
export async function getResumoMensalDaEmpresa(
  empresaNome: string,
  mes: Mes,
  ano: number,
  origem: OrigemDadosReais = "pago"
): Promise<ResumoEmpresaMes | null> {
  const supabase = getSupabase()
  if (!supabase) return null
  const { inicio, fim } = rangeDoMesISO(mes, ano)
  const { data, error } = await supabase
    .from("dados_diarios_log")
    .select(COLUNAS_AGREGAR)
    .eq("empresa", empresaNome)
    .eq("origem", origem)
    .gte("data", inicio)
    .lte("data", fim)
  if (error) {
    console.error("[sentinela] getResumoMensalDaEmpresa error", error.message)
    return null
  }
  const linhas = (data ?? []) as LinhaAgregavel[]
  if (linhas.length === 0) return null
  return agregarLinhas(empresaNome, linhas)
}

/**
 * Variantes por INTERVALO de datas (YYYY-MM-DD, ambos inclusivos). Usadas
 * quando o seletor de período global está em modo 'dia' ou 'intervalo'.
 * Espelham getResumoMensalPorEmpresa/getResumoMensalDaEmpresa, mas o range
 * vem pronto em vez de derivado de (mes, ano). Reutilizam agregarLinhas.
 */
export async function getResumoPorIntervaloPorEmpresa(
  inicio: string,
  fim: string,
  origem: OrigemDadosReais = "pago"
): Promise<Map<string, ResumoEmpresaMes>> {
  const supabase = getSupabase()
  if (!supabase) return new Map()
  const { data, error } = await supabase
    .from("dados_diarios_log")
    .select(COLUNAS_AGREGAR)
    .eq("origem", origem)
    .gte("data", inicio)
    .lte("data", fim)
  if (error) {
    console.error(
      "[sentinela] getResumoPorIntervaloPorEmpresa error",
      error.message
    )
    return new Map()
  }
  const porEmpresa = new Map<string, LinhaAgregavel[]>()
  for (const l of (data ?? []) as LinhaAgregavel[]) {
    const lista = porEmpresa.get(l.empresa)
    if (lista) lista.push(l)
    else porEmpresa.set(l.empresa, [l])
  }
  const resultado = new Map<string, ResumoEmpresaMes>()
  for (const [empresa, linhas] of porEmpresa) {
    resultado.set(empresa, agregarLinhas(empresa, linhas))
  }
  return resultado
}

export async function getResumoPorIntervaloDaEmpresa(
  empresaNome: string,
  inicio: string,
  fim: string,
  origem: OrigemDadosReais = "pago"
): Promise<ResumoEmpresaMes | null> {
  const supabase = getSupabase()
  if (!supabase) return null
  const { data, error } = await supabase
    .from("dados_diarios_log")
    .select(COLUNAS_AGREGAR)
    .eq("empresa", empresaNome)
    .eq("origem", origem)
    .gte("data", inicio)
    .lte("data", fim)
  if (error) {
    console.error(
      "[sentinela] getResumoPorIntervaloDaEmpresa error",
      error.message
    )
    return null
  }
  const linhas = (data ?? []) as LinhaAgregavel[]
  if (linhas.length === 0) return null
  return agregarLinhas(empresaNome, linhas)
}

/** Map<Mes, resumo> dos 9 meses (Abril..Dezembro) do ano pra uma empresa.
 *  Substitui o array DadosReais[] que getDadosReais devolvia. */
export async function getResumoAnualDaEmpresa(
  empresaNome: string,
  ano: number,
  origem: OrigemDadosReais = "pago"
): Promise<Map<Mes, ResumoEmpresaMes>> {
  const supabase = getSupabase()
  if (!supabase) return new Map()
  const { data, error } = await supabase
    .from("dados_diarios_log")
    .select(COLUNAS_AGREGAR)
    .eq("empresa", empresaNome)
    .eq("origem", origem)
    .gte("data", `${ano}-01-01`)
    .lte("data", `${ano}-12-31`)
  if (error) {
    console.error("[sentinela] getResumoAnualDaEmpresa error", error.message)
    return new Map()
  }
  const porMes = new Map<Mes, LinhaAgregavel[]>()
  for (const l of (data ?? []) as LinhaAgregavel[]) {
    const mes = dataISOParaMes(l.data)
    if (!mes) continue
    const lista = porMes.get(mes)
    if (lista) lista.push(l)
    else porMes.set(mes, [l])
  }
  const resultado = new Map<Mes, ResumoEmpresaMes>()
  for (const [mes, linhas] of porMes) {
    resultado.set(mes, agregarLinhas(empresaNome, linhas))
  }
  return resultado
}

/** Série mensal de faturamento agregado de TODAS as empresas no ano.
 *  Substitui getFaturamentoMensalHub (que lia de dados_reais).
 *  Se `empresasAtivas` for passado, filtra para incluir apenas linhas
 *  dessas empresas — evita vazar histórico de empresas desativadas
 *  (mesmo critério do KPI consolidado do /dashboard). */
export async function getFaturamentoMensalHubFromLogs(
  ano: number,
  origem: OrigemDadosReais = "pago",
  empresasAtivas?: string[]
): Promise<{ mes: Mes; real: number | null }[]> {
  const supabase = getSupabase()
  if (!supabase) return MESES.map((mes) => ({ mes, real: null }))
  let q = supabase
    .from("dados_diarios_log")
    .select("empresa, data, faturamento_real")
    .eq("origem", origem)
    .gte("data", `${ano}-01-01`)
    .lte("data", `${ano}-12-31`)
  if (empresasAtivas && empresasAtivas.length > 0) {
    q = q.in("empresa", empresasAtivas)
  }
  const { data, error } = await q
  if (error) {
    console.error(
      "[sentinela] getFaturamentoMensalHubFromLogs error",
      error.message
    )
    return MESES.map((mes) => ({ mes, real: null }))
  }
  const acc = new Map<Mes, { soma: number; tem: boolean }>()
  for (const row of (data ?? []) as {
    empresa: string
    data: string
    faturamento_real: number | null
  }[]) {
    const mes = dataISOParaMes(row.data)
    if (!mes) continue
    const bucket = acc.get(mes) ?? { soma: 0, tem: false }
    if (row.faturamento_real != null) {
      bucket.soma += Number(row.faturamento_real)
      bucket.tem = true
    }
    acc.set(mes, bucket)
  }
  return MESES.map((mes) => {
    const bucket = acc.get(mes)
    return { mes, real: bucket?.tem ? bucket.soma : null }
  })
}

/** Adapter: monta um shape DadosReais a partir de ResumoEmpresaMes,
 *  pra compatibilidade com CenarioReal e DrawerDadosReais (que esperam
 *  DadosReais). Zero vira null pros campos numéricos — assim a UI
 *  trata "vazio" igual ao que getDadosReaisMes devolvia. */
export function resumoComoDadosReais(
  r: ResumoEmpresaMes | null,
  mes: Mes,
  ano: number,
  origem: OrigemDadosReais
): DadosReais | null {
  if (!r) return null
  const zeroOuNum = (n: number) => (n > 0 ? n : null)
  return {
    empresa: r.empresa,
    mes,
    ano,
    origem,
    investimento_real: zeroOuNum(r.investimento),
    leads_real: zeroOuNum(r.leads),
    reunioes_real: zeroOuNum(r.reunioes),
    contratos_real: zeroOuNum(r.contratos),
    faturamento_real: zeroOuNum(r.faturamento),
    criativos_entregues: zeroOuNum(r.criativosEntregues),
    criativos_usados: r.criativosUsados,
    clientes_ativos: r.clientesAtivos,
    cpl_real: r.cplReal,
    cpa_real: r.cpaReal,
    observacoes: r.observacoes,
    respostas: zeroOuNum(r.respostas),
    // Não agregamos jsonb — views detalhadas (timeline) leem
    // diretamente de dados_diarios_log via getDadosDiariosDoMes*.
    criativos_detalhe: [],
    publicos_prospectados: [],
  }
}
