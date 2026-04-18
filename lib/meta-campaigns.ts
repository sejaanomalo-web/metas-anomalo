import { contaMetaDaEmpresa, metaTokenDisponivel } from "./meta-accounts"
import type { EmpresaDb } from "./data"

const META_GRAPH = "https://graph.facebook.com/v21.0"

export interface MetaErro {
  codigo: "sem_token" | "sem_conta" | "token_invalido" | "rate_limit" | "outro"
  mensagem: string
}

export interface CampanhaResumo {
  id: string
  nome: string
  status: string
  objetivo: string
  orcamentoDiario?: number
  orcamentoTotal?: number
}

export interface InsightsCampanha {
  spend: number
  impressions: number
  reach: number
  clicks: number
  ctr: number
  leads: number
  cpl: number | null
}

export interface AdsetResumo {
  id: string
  nome: string
  status: string
  orcamentoDiario?: number
}

export type Periodo = "hoje" | "7_dias" | "mes_atual" | "mes_anterior"

export function intervaloDoPeriodo(periodo: Periodo, hoje: Date = new Date()) {
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  const inicio = new Date(hoje)
  let fim = new Date(hoje)
  if (periodo === "hoje") {
    // nada
  } else if (periodo === "7_dias") {
    inicio.setDate(inicio.getDate() - 6)
  } else if (periodo === "mes_atual") {
    inicio.setDate(1)
  } else if (periodo === "mes_anterior") {
    inicio.setMonth(inicio.getMonth() - 1, 1)
    fim = new Date(hoje.getFullYear(), hoje.getMonth(), 0)
  }
  return { since: iso(inicio), until: iso(fim) }
}

function traduzirErro(err: {
  code?: number
  message?: string
  type?: string
}): MetaErro {
  if (err.code === 190) {
    return {
      codigo: "token_invalido",
      mensagem:
        "Token Meta Ads inválido — verificar variável META_ACCESS_TOKEN no Vercel",
    }
  }
  if (err.code === 17 || err.code === 32) {
    return {
      codigo: "rate_limit",
      mensagem:
        "Limite de requisições atingido, tente novamente em alguns minutos",
    }
  }
  return {
    codigo: "outro",
    mensagem: err.message ?? "Erro desconhecido da API Meta",
  }
}

async function fetchGraph<T>(
  caminho: string,
  params: Record<string, string>
): Promise<{ data?: T; erro?: MetaErro }> {
  const token = process.env.META_ACCESS_TOKEN
  if (!token) {
    return { erro: { codigo: "sem_token", mensagem: "META_ACCESS_TOKEN ausente" } }
  }
  const qs = new URLSearchParams({ ...params, access_token: token })
  try {
    const res = await fetch(`${META_GRAPH}/${caminho}?${qs.toString()}`, {
      next: { revalidate: 60 },
    })
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as
        | { error?: { code?: number; message?: string; type?: string } }
        | null
      if (body?.error) return { erro: traduzirErro(body.error) }
      return {
        erro: {
          codigo: "outro",
          mensagem: `Meta API respondeu ${res.status}`,
        },
      }
    }
    const json = (await res.json()) as T
    return { data: json }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao chamar Meta API"
    return { erro: { codigo: "outro", mensagem: msg } }
  }
}

export async function listarCampanhas(
  empresa: EmpresaDb
): Promise<{ data?: CampanhaResumo[]; erro?: MetaErro }> {
  const conta = contaMetaDaEmpresa(empresa)
  if (!conta) {
    return { erro: { codigo: "sem_conta", mensagem: "Conta Meta não configurada" } }
  }
  if (!metaTokenDisponivel()) {
    return {
      erro: {
        codigo: "sem_token",
        mensagem: "META_ACCESS_TOKEN ausente no Vercel",
      },
    }
  }

  const { data, erro } = await fetchGraph<{
    data?: Array<{
      id: string
      name: string
      effective_status: string
      objective?: string
      daily_budget?: string
      lifetime_budget?: string
    }>
  }>(`${conta}/campaigns`, {
    fields: "id,name,effective_status,objective,daily_budget,lifetime_budget",
    filtering: JSON.stringify([
      {
        field: "effective_status",
        operator: "IN",
        value: ["ACTIVE", "PAUSED"],
      },
    ]),
    limit: "50",
  })
  if (erro) return { erro }

  const lista: CampanhaResumo[] = (data?.data ?? []).map((c) => ({
    id: c.id,
    nome: c.name,
    status: c.effective_status,
    objetivo: c.objective ?? "",
    orcamentoDiario: c.daily_budget ? Number(c.daily_budget) / 100 : undefined,
    orcamentoTotal: c.lifetime_budget
      ? Number(c.lifetime_budget) / 100
      : undefined,
  }))
  return { data: lista }
}

export async function insightsDaCampanha(
  campanhaId: string,
  periodo: Periodo
): Promise<{ data?: InsightsCampanha; erro?: MetaErro }> {
  const intervalo = intervaloDoPeriodo(periodo)
  const { data, erro } = await fetchGraph<{
    data?: Array<{
      spend?: string
      impressions?: string
      reach?: string
      clicks?: string
      ctr?: string
      actions?: Array<{ action_type: string; value: string }>
    }>
  }>(`${campanhaId}/insights`, {
    fields: "spend,impressions,reach,clicks,ctr,actions",
    time_range: JSON.stringify(intervalo),
  })
  if (erro) return { erro }
  const row = data?.data?.[0]
  if (!row) {
    return {
      data: {
        spend: 0,
        impressions: 0,
        reach: 0,
        clicks: 0,
        ctr: 0,
        leads: 0,
        cpl: null,
      },
    }
  }
  const leads =
    row.actions?.find(
      (a) =>
        a.action_type === "lead" ||
        a.action_type === "onsite_conversion.lead_grouped"
    )?.value ?? "0"
  const leadsNum = Number(leads) || 0
  const spend = Number(row.spend ?? 0)
  return {
    data: {
      spend,
      impressions: Number(row.impressions ?? 0),
      reach: Number(row.reach ?? 0),
      clicks: Number(row.clicks ?? 0),
      ctr: Number(row.ctr ?? 0),
      leads: leadsNum,
      cpl: leadsNum > 0 ? Number((spend / leadsNum).toFixed(2)) : null,
    },
  }
}

export async function listarAdsetsDaCampanha(
  campanhaId: string
): Promise<{ data?: AdsetResumo[]; erro?: MetaErro }> {
  const { data, erro } = await fetchGraph<{
    data?: Array<{
      id: string
      name: string
      status: string
      daily_budget?: string
    }>
  }>(`${campanhaId}/adsets`, {
    fields: "id,name,status,daily_budget",
    limit: "25",
  })
  if (erro) return { erro }
  const lista: AdsetResumo[] = (data?.data ?? []).map((a) => ({
    id: a.id,
    nome: a.name,
    status: a.status,
    orcamentoDiario: a.daily_budget ? Number(a.daily_budget) / 100 : undefined,
  }))
  return { data: lista }
}
