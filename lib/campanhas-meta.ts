"use server"

import { getSupabase } from "./supabase"
import type { EmpresaDb, Mes } from "./data"

/**
 * Snapshot mensal de uma campanha do Meta Ads, lido da tabela
 * `campanhas_meta`. Apenas métricas reais do Meta — contratos,
 * faturamento, ticket médio etc. são dados manuais e vivem em
 * `dados_reais`.
 */
export interface CampanhaMeta {
  id: string
  empresa: string
  campanha_id: string
  nome: string
  status: string | null
  objetivo: string | null
  orcamento_diario: number | null
  orcamento_total: number | null
  mes: string
  ano: number
  spend: number
  leads: number
  impressions: number
  reach: number
  clicks: number
  ctr: number | null
  cpl: number | null
  frequencia: number | null
  criativos_ativos: number | null
  ultima_sincronizacao: string
}

/**
 * Insights agregados — soma de várias campanhas ou de uma específica.
 * Frequência e CTR são recalculados a partir dos totais.
 */
export interface InsightsAgregados {
  spend: number
  leads: number
  impressions: number
  reach: number
  clicks: number
  ctr: number | null
  cpl: number | null
  frequencia: number | null
  criativosAtivos: number
  ultimaSincronizacao: string | null
}

/**
 * Lista todas as campanhas de uma empresa para o mês/ano dado,
 * ordenadas por spend desc (a mais ativa primeiro).
 */
export async function listarCampanhasMeta(
  empresa: EmpresaDb,
  mes: Mes,
  ano: number
): Promise<CampanhaMeta[]> {
  const supabase = getSupabase()
  if (!supabase) return []
  const { data, error } = await supabase
    .from("campanhas_meta")
    .select("*")
    .eq("empresa", empresa)
    .eq("mes", mes)
    .eq("ano", ano)
    .order("spend", { ascending: false })
  if (error) {
    console.error("[campanhas_meta] list error", error.message)
    return []
  }
  return (data ?? []) as CampanhaMeta[]
}

/**
 * Agrega insights de uma lista de campanhas. Soma totais e recalcula
 * CTR (clicks/impressions) e frequência (impressions/reach) — esses
 * dois NÃO podem ser somados diretamente (são razões). CPL é
 * recalculado como spend/leads.
 */
export function agregarInsights(
  campanhas: CampanhaMeta[]
): InsightsAgregados {
  let spend = 0
  let leads = 0
  let impressions = 0
  let reach = 0
  let clicks = 0
  let criativosAtivos = 0
  let ultimaSincronizacao: string | null = null
  for (const c of campanhas) {
    spend += Number(c.spend ?? 0)
    leads += Number(c.leads ?? 0)
    impressions += Number(c.impressions ?? 0)
    reach += Number(c.reach ?? 0)
    clicks += Number(c.clicks ?? 0)
    criativosAtivos += Number(c.criativos_ativos ?? 0)
    if (
      c.ultima_sincronizacao &&
      (!ultimaSincronizacao || c.ultima_sincronizacao > ultimaSincronizacao)
    ) {
      ultimaSincronizacao = c.ultima_sincronizacao
    }
  }
  return {
    spend,
    leads,
    impressions,
    reach,
    clicks,
    ctr: impressions > 0 ? (clicks / impressions) * 100 : null,
    cpl: leads > 0 ? spend / leads : null,
    frequencia: reach > 0 ? impressions / reach : null,
    criativosAtivos,
    ultimaSincronizacao,
  }
}

/**
 * Converte uma campanha individual no formato InsightsAgregados pra
 * a UI tratar agregado e individual exatamente do mesmo jeito.
 */
export function insightsDaCampanha(c: CampanhaMeta): InsightsAgregados {
  return {
    spend: Number(c.spend ?? 0),
    leads: Number(c.leads ?? 0),
    impressions: Number(c.impressions ?? 0),
    reach: Number(c.reach ?? 0),
    clicks: Number(c.clicks ?? 0),
    ctr: c.ctr !== null ? Number(c.ctr) : null,
    cpl: c.cpl !== null ? Number(c.cpl) : null,
    frequencia: c.frequencia !== null ? Number(c.frequencia) : null,
    criativosAtivos: c.criativos_ativos ?? 0,
    ultimaSincronizacao: c.ultima_sincronizacao,
  }
}
