import { getSupabaseAdmin } from "./supabase"
import {
  type DiaSentinela,
  type LinhaDoMes,
  resumirMesSentinela,
  type ResumoMesSentinela,
} from "./sentinela"

// ============================================================
// Tipos
// ============================================================

export type StatusCampanha = "ativo" | "desativado" | "sem_conexao"

export interface ClienteTrafego {
  id: string
  empresa_nome: string
  nome: string
  slug: string
  /** Rótulo exibido na UI. Quando NULL, usa `nome` (fallback). */
  display_name: string | null
  token_meta_id: string | null
  /** Modo origem: aponta pra tokens_meta.empresa cujos dados em
   *  dados_diarios_log representam este cliente. Quando preenchido,
   *  leitura agrega de dados_diarios_log[empresa=empresa_origem_nome]
   *  e o status é derivado dali. */
  empresa_origem_nome: string | null
  /** Modo regex: aplicado pelo Sentinela em dados_diarios_cliente.
   *  Mutuamente exclusivo com empresa_origem_nome no uso típico. */
  campaign_filter: string | null
  ativo: boolean
  ordem: number
  status_campanhas: StatusCampanha
  status_atualizado_em: string | null
  ultimo_erro: string | null
}

export interface ResumoClienteMes {
  cliente: ClienteTrafego
  investimento: number
  leads: number
  cpl: number | null
  dias: number
}

export function statusCampanhaRotulo(s: StatusCampanha): string {
  switch (s) {
    case "ativo": return "Ativo"
    case "desativado": return "Desativado"
    case "sem_conexao": return "Sem conexão"
  }
}

/** Helper canônico — sempre use ao renderizar o nome do cliente. */
export function clienteDisplayName(c: ClienteTrafego): string {
  return c.display_name && c.display_name.trim() !== "" ? c.display_name : c.nome
}

// ============================================================
// Leituras de cadastro (cliente_trafego)
// ============================================================

const COLUNAS_CLIENTE =
  "id, empresa_nome, nome, slug, display_name, token_meta_id, empresa_origem_nome, campaign_filter, ativo, ordem, status_campanhas, status_atualizado_em, ultimo_erro"

export async function listarClientesDaEmpresa(
  empresaNome: string,
  apenasAtivos = false
): Promise<ClienteTrafego[]> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return []
  let q = supabase
    .from("cliente_trafego")
    .select(COLUNAS_CLIENTE)
    .eq("empresa_nome", empresaNome)
    .order("ordem")
    .order("nome")
  if (apenasAtivos) q = q.eq("ativo", true)
  const { data, error } = await q
  if (error) {
    console.error("[clientes] listarClientesDaEmpresa error", error.message)
    return []
  }
  return (data ?? []) as ClienteTrafego[]
}

export async function getClientePorSlug(
  empresaNome: string,
  clienteSlug: string
): Promise<ClienteTrafego | null> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return null
  const { data, error } = await supabase
    .from("cliente_trafego")
    .select(COLUNAS_CLIENTE)
    .eq("empresa_nome", empresaNome)
    .eq("slug", clienteSlug)
    .maybeSingle()
  if (error) {
    console.error("[clientes] getClientePorSlug error", error.message)
    return null
  }
  return (data ?? null) as ClienteTrafego | null
}

// ============================================================
// Leituras de métricas (multi-modo)
// ============================================================

/** Modo origem: lê de dados_diarios_log[empresa=empresa_origem_nome].
 *  Modo regex: lê de dados_diarios_cliente[empresa_nome, cliente_nome].
 *  Modo placeholder: retorna []. */
export async function getDiasSentinelaDoCliente(
  cliente: ClienteTrafego,
  inicio: string,
  fim: string
): Promise<DiaSentinela[]> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return []
  const hojeISO = new Date().toISOString().slice(0, 10)

  if (cliente.empresa_origem_nome) {
    // Modo origem — agrega dados_diarios_log da empresa-origem
    const { data, error } = await supabase
      .from("dados_diarios_log")
      .select("data, investimento_real, leads_real, cpl_real, preenchedor_nome, created_at")
      .eq("empresa", cliente.empresa_origem_nome)
      .eq("origem", "pago")
      .eq("preenchedor_nome", "Sentinela Anomalo")
      .gte("data", inicio)
      .lte("data", fim)
      .order("data", { ascending: true })
    if (error) {
      console.error("[clientes] getDiasSentinelaDoCliente origem error", error.message)
      return []
    }
    return (data ?? []).map((d) => ({
      data: d.data as string,
      investimento_real: d.investimento_real as number | null,
      leads_real: d.leads_real as number | null,
      cpl_real: d.cpl_real as number | null,
      preenchedor_nome: d.preenchedor_nome as string | null,
      created_at: d.created_at as string,
      parcial: d.data === hojeISO,
    })) as DiaSentinela[]
  }

  if (cliente.campaign_filter) {
    // Modo regex — lê de dados_diarios_cliente (Sentinela sub-filtrou)
    const { data, error } = await supabase
      .from("dados_diarios_cliente")
      .select("data, investimento_real, leads_real, cpl_real, created_at")
      .eq("empresa_nome", cliente.empresa_nome)
      .eq("cliente_nome", cliente.nome)
      .eq("origem", "pago")
      .gte("data", inicio)
      .lte("data", fim)
      .order("data", { ascending: true })
    if (error) {
      console.error("[clientes] getDiasSentinelaDoCliente regex error", error.message)
      return []
    }
    return (data ?? []).map((d) => ({
      data: d.data as string,
      investimento_real: d.investimento_real as number | null,
      leads_real: d.leads_real as number | null,
      cpl_real: d.cpl_real as number | null,
      preenchedor_nome: "Sentinela Anomalo",
      created_at: d.created_at as string,
      parcial: d.data === hojeISO,
    })) as DiaSentinela[]
  }

  // Modo placeholder — sem dados
  return []
}

/** Linhas do mês pro histórico diário. Modo origem inclui campos
 *  manuais (reuniões/contratos/faturamento) preenchidos por humanos
 *  na empresa-origem — semanticamente fazem sentido aqui também.
 *  Modo regex: campos manuais sempre null. */
export async function getLinhasDoMesCliente(
  cliente: ClienteTrafego,
  inicio: string,
  fim: string
): Promise<LinhaDoMes[]> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return []

  if (cliente.empresa_origem_nome) {
    const { data, error } = await supabase
      .from("dados_diarios_log")
      .select(
        "data, investimento_real, leads_real, cpl_real, reunioes_real, contratos_real, faturamento_real, preenchedor_nome, created_at"
      )
      .eq("empresa", cliente.empresa_origem_nome)
      .eq("origem", "pago")
      .gte("data", inicio)
      .lte("data", fim)
      .order("data", { ascending: false })
    if (error) {
      console.error("[clientes] getLinhasDoMesCliente origem error", error.message)
      return []
    }
    return (data ?? []) as LinhaDoMes[]
  }

  if (cliente.campaign_filter) {
    const { data, error } = await supabase
      .from("dados_diarios_cliente")
      .select("data, investimento_real, leads_real, cpl_real, created_at")
      .eq("empresa_nome", cliente.empresa_nome)
      .eq("cliente_nome", cliente.nome)
      .eq("origem", "pago")
      .gte("data", inicio)
      .lte("data", fim)
      .order("data", { ascending: false })
    if (error) {
      console.error("[clientes] getLinhasDoMesCliente regex error", error.message)
      return []
    }
    return (data ?? []).map((d) => ({
      data: d.data as string,
      investimento_real: d.investimento_real as number | null,
      leads_real: d.leads_real as number | null,
      cpl_real: d.cpl_real as number | null,
      reunioes_real: null,
      contratos_real: null,
      faturamento_real: null,
      preenchedor_nome: "Sentinela Anomalo",
      created_at: d.created_at as string,
    })) as LinhaDoMes[]
  }

  return []
}

// ============================================================
// Derivação de status (modo origem)
// ============================================================

/** Janela em dias pra avaliar "sem atividade recente". */
const JANELA_DIAS_INATIVO = 7

interface LinhaStatus {
  data: string
  investimento_real: number | null
  leads_real: number | null
}

/** Deriva status do cliente em modo origem a partir das últimas N
 *  linhas de dados_diarios_log[empresa=empresa_origem_nome]:
 *    sem_conexao → não há linha em até JANELA_DIAS_INATIVO dias
 *    desativado  → todas as linhas da janela têm investimento_real=0
 *    ativo       → caso contrário
 *  Status é cosmético — não bloqueia leitura. */
function derivarStatusModoOrigem(linhas: LinhaStatus[]): StatusCampanha {
  if (linhas.length === 0) return "sem_conexao"
  const algumGasto = linhas.some(
    (l) => Number(l.investimento_real ?? 0) > 0
  )
  return algumGasto ? "ativo" : "desativado"
}

/** Resumo mensal de TODOS os clientes de uma empresa. Roteia por
 *  modo (origem/regex/placeholder) e deriva status fresco em modo
 *  origem a partir de dados_diarios_log — fonte mais robusta que
 *  varrer logs_sentinela.anomalias_detectadas. */
export async function getResumoTodosClientesMes(
  empresaNome: string,
  inicio: string,
  fim: string
): Promise<ResumoClienteMes[]> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return []

  const clientes = await listarClientesDaEmpresa(empresaNome, false)
  if (clientes.length === 0) return []

  // Particiona clientes por modo pra fazer 2 queries em paralelo
  // (uma em dados_diarios_log, outra em dados_diarios_cliente).
  const empresasOrigem = Array.from(
    new Set(
      clientes
        .filter((c) => c.empresa_origem_nome)
        .map((c) => c.empresa_origem_nome as string)
    )
  )
  const temClienteRegex = clientes.some(
    (c) => !c.empresa_origem_nome && c.campaign_filter
  )

  // Janela pra status: últimos JANELA_DIAS_INATIVO dias antes de hoje.
  const hojeISO = new Date().toISOString().slice(0, 10)
  const janelaInicio = new Date()
  janelaInicio.setUTCDate(janelaInicio.getUTCDate() - JANELA_DIAS_INATIVO)
  const janelaInicioISO = janelaInicio.toISOString().slice(0, 10)

  type LogRow = {
    empresa: string
    data: string
    investimento_real: number | null
    leads_real: number | null
  }
  type ClienteRow = {
    cliente_nome: string
    data: string
    investimento_real: number | null
    leads_real: number | null
  }

  const [logRes, cliRes, statusRes] = await Promise.all([
    empresasOrigem.length > 0
      ? supabase
          .from("dados_diarios_log")
          .select("empresa, data, investimento_real, leads_real")
          .in("empresa", empresasOrigem)
          .eq("origem", "pago")
          .gte("data", inicio)
          .lte("data", fim)
      : Promise.resolve({ data: [] as LogRow[], error: null }),
    temClienteRegex
      ? supabase
          .from("dados_diarios_cliente")
          .select("cliente_nome, data, investimento_real, leads_real")
          .eq("empresa_nome", empresaNome)
          .eq("origem", "pago")
          .gte("data", inicio)
          .lte("data", fim)
      : Promise.resolve({ data: [] as ClienteRow[], error: null }),
    // Janela pra status (últimos 7 dias). Só pra empresas origem.
    empresasOrigem.length > 0
      ? supabase
          .from("dados_diarios_log")
          .select("empresa, data, investimento_real, leads_real")
          .in("empresa", empresasOrigem)
          .eq("origem", "pago")
          .gte("data", janelaInicioISO)
          .lte("data", hojeISO)
      : Promise.resolve({ data: [] as LogRow[], error: null }),
  ])

  // Agrega por empresa-origem (modo origem)
  const aggOrigem = new Map<string, { inv: number; leads: number; dias: Set<string> }>()
  for (const r of ((logRes.data ?? []) as LogRow[])) {
    const e = aggOrigem.get(r.empresa) ?? { inv: 0, leads: 0, dias: new Set<string>() }
    e.inv += Number(r.investimento_real ?? 0)
    e.leads += Number(r.leads_real ?? 0)
    if (r.investimento_real != null || r.leads_real != null) e.dias.add(r.data)
    aggOrigem.set(r.empresa, e)
  }

  // Status fresco por empresa-origem (janela 7d)
  const statusOrigem = new Map<string, StatusCampanha>()
  const linhasJanelaPorEmpresa = new Map<string, LinhaStatus[]>()
  for (const r of ((statusRes.data ?? []) as LogRow[])) {
    const arr = linhasJanelaPorEmpresa.get(r.empresa) ?? []
    arr.push({
      data: r.data,
      investimento_real: r.investimento_real,
      leads_real: r.leads_real,
    })
    linhasJanelaPorEmpresa.set(r.empresa, arr)
  }
  for (const empresa of empresasOrigem) {
    statusOrigem.set(
      empresa,
      derivarStatusModoOrigem(linhasJanelaPorEmpresa.get(empresa) ?? [])
    )
  }

  // Agrega por cliente_nome (modo regex)
  const aggRegex = new Map<string, { inv: number; leads: number; dias: Set<string> }>()
  for (const r of ((cliRes.data ?? []) as ClienteRow[])) {
    const e = aggRegex.get(r.cliente_nome) ?? { inv: 0, leads: 0, dias: new Set<string>() }
    e.inv += Number(r.investimento_real ?? 0)
    e.leads += Number(r.leads_real ?? 0)
    if (r.investimento_real != null || r.leads_real != null) e.dias.add(r.data)
    aggRegex.set(r.cliente_nome, e)
  }

  return clientes.map((cliente) => {
    // Roteamento por modo
    const e = cliente.empresa_origem_nome
      ? aggOrigem.get(cliente.empresa_origem_nome) ?? { inv: 0, leads: 0, dias: new Set<string>() }
      : cliente.campaign_filter
      ? aggRegex.get(cliente.nome) ?? { inv: 0, leads: 0, dias: new Set<string>() }
      : { inv: 0, leads: 0, dias: new Set<string>() }

    // Status: modo origem deriva fresh; modo regex usa o que o Sentinela
    // já gravou em cliente_trafego (se sem origem nem regex = placeholder).
    const statusFresh: StatusCampanha = cliente.empresa_origem_nome
      ? statusOrigem.get(cliente.empresa_origem_nome) ?? "sem_conexao"
      : cliente.status_campanhas

    return {
      cliente: { ...cliente, status_campanhas: statusFresh },
      investimento: e.inv,
      leads: e.leads,
      cpl: e.leads > 0 ? e.inv / e.leads : null,
      dias: e.dias.size,
    }
  })
}

/** Resumo do mês de UM cliente (4 KPIs do painel). */
export async function getResumoMesCliente(
  cliente: ClienteTrafego,
  inicio: string,
  fim: string
): Promise<ResumoMesSentinela> {
  const dias = await getDiasSentinelaDoCliente(cliente, inicio, fim)
  return resumirMesSentinela(dias)
}
