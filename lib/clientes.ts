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
  token_meta_id: string | null
  campaign_filter: string
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

// ============================================================
// Leituras de cadastro (cliente_trafego)
// ============================================================

export async function listarClientesDaEmpresa(
  empresaNome: string,
  apenasAtivos = false
): Promise<ClienteTrafego[]> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return []
  let q = supabase
    .from("cliente_trafego")
    .select(
      "id, empresa_nome, nome, slug, token_meta_id, campaign_filter, ativo, ordem, status_campanhas, status_atualizado_em, ultimo_erro"
    )
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
    .select(
      "id, empresa_nome, nome, slug, token_meta_id, campaign_filter, ativo, ordem, status_campanhas, status_atualizado_em, ultimo_erro"
    )
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
// Leituras de métricas (dados_diarios_cliente)
// Espelham getDiasSentinelaDaEmpresa / getLinhasDoMes mas leem da
// tabela de cliente. Retornam os MESMOS tipos pra reusar
// resumirMesSentinela e o PainelTrafego.
// ============================================================

export async function getDiasSentinelaDoCliente(
  empresaNome: string,
  clienteNome: string,
  inicio: string,
  fim: string
): Promise<DiaSentinela[]> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return []
  const { data, error } = await supabase
    .from("dados_diarios_cliente")
    .select("data, investimento_real, leads_real, cpl_real, created_at")
    .eq("empresa_nome", empresaNome)
    .eq("cliente_nome", clienteNome)
    .eq("origem", "pago")
    .gte("data", inicio)
    .lte("data", fim)
    .order("data", { ascending: true })
  if (error) {
    console.error("[clientes] getDiasSentinelaDoCliente error", error.message)
    return []
  }
  const hojeISO = new Date().toISOString().slice(0, 10)
  return (data ?? []).map((d) => ({
    data: d.data as string,
    investimento_real: d.investimento_real as number | null,
    leads_real: d.leads_real as number | null,
    cpl_real: d.cpl_real as number | null,
    // Sentinela é o único preenchedor de cliente (não há manual).
    preenchedor_nome: "Sentinela Anomalo",
    created_at: d.created_at as string,
    parcial: d.data === hojeISO,
  })) as DiaSentinela[]
}

/** Linhas do mês do cliente pro histórico diário. Campos manuais
 *  (reuniões/contratos/faturamento) são sempre null — cliente é
 *  tráfego puro. Mesmo shape de LinhaDoMes pra reusar a tabela. */
export async function getLinhasDoMesCliente(
  empresaNome: string,
  clienteNome: string,
  inicio: string,
  fim: string
): Promise<LinhaDoMes[]> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return []
  const { data, error } = await supabase
    .from("dados_diarios_cliente")
    .select("data, investimento_real, leads_real, cpl_real, created_at")
    .eq("empresa_nome", empresaNome)
    .eq("cliente_nome", clienteNome)
    .eq("origem", "pago")
    .gte("data", inicio)
    .lte("data", fim)
    .order("data", { ascending: false })
  if (error) {
    console.error("[clientes] getLinhasDoMesCliente error", error.message)
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

/** Resumo mensal de TODOS os clientes de uma empresa — alimenta a
 *  lista de mini-cards. Uma query só, agregada em memória. */
export async function getResumoTodosClientesMes(
  empresaNome: string,
  inicio: string,
  fim: string
): Promise<ResumoClienteMes[]> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return []

  const clientes = await listarClientesDaEmpresa(empresaNome, false)
  if (clientes.length === 0) return []

  const { data, error } = await supabase
    .from("dados_diarios_cliente")
    .select("cliente_nome, investimento_real, leads_real, data")
    .eq("empresa_nome", empresaNome)
    .eq("origem", "pago")
    .gte("data", inicio)
    .lte("data", fim)
  if (error) {
    console.error("[clientes] getResumoTodosClientesMes error", error.message)
  }

  type Row = { cliente_nome: string; investimento_real: number | null; leads_real: number | null; data: string }
  const acc = new Map<string, { inv: number; leads: number; dias: Set<string> }>()
  for (const r of (data ?? []) as Row[]) {
    const e = acc.get(r.cliente_nome) ?? { inv: 0, leads: 0, dias: new Set<string>() }
    e.inv += Number(r.investimento_real ?? 0)
    e.leads += Number(r.leads_real ?? 0)
    if (r.investimento_real != null || r.leads_real != null) e.dias.add(r.data)
    acc.set(r.cliente_nome, e)
  }

  return clientes.map((cliente) => {
    const e = acc.get(cliente.nome) ?? { inv: 0, leads: 0, dias: new Set<string>() }
    return {
      cliente,
      investimento: e.inv,
      leads: e.leads,
      cpl: e.leads > 0 ? e.inv / e.leads : null,
      dias: e.dias.size,
    }
  })
}

/** Resumo do mês de UM cliente (4 KPIs do painel). Reusa
 *  resumirMesSentinela sobre os dias do cliente. */
export async function getResumoMesCliente(
  empresaNome: string,
  clienteNome: string,
  inicio: string,
  fim: string
): Promise<ResumoMesSentinela> {
  const dias = await getDiasSentinelaDoCliente(empresaNome, clienteNome, inicio, fim)
  return resumirMesSentinela(dias)
}
