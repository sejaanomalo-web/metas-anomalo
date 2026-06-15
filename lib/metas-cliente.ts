"use server"

import { revalidatePath } from "next/cache"
import { getSupabaseAdmin } from "./supabase"
import {
  type Mes,
  type OrigemDadosReais,
  MESES,
  ORIGEM_PADRAO,
  origemValida,
} from "./data"
import {
  getClientePorId,
  getResumoMesCliente,
  getResumoTodosClientesMes,
  type ClienteTrafego,
} from "./clientes"
import { getRealizadoOrganicoDoCliente } from "./relatorios-comerciais"
import type { RealizadoOrganicoCliente } from "./comercial-tipos"
import type { DadosReais } from "./supabase"

// ============================================================
// Metas por CLIENTE de tráfego (espelha lib/metas-empresa.ts).
//
// Diferenças vs. metas_empresa:
//   • chaveado por cliente_trafego.id (uuid estável), não por empresa.db;
//   • metas_cliente tem RLS ligada SEM policy → usa getSupabaseAdmin
//     (service role), enquanto metas_empresa é anon-acessível.
// Igual à empresa: pago e organico são linhas separadas (origem na chave
// única) e overrides é um dicionário {chave:number} (mesma whitelist).
// ============================================================

export interface ResultadoMeta {
  ok: boolean
  erro?: string
}

export type MetaOverride = Record<string, number>

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** pt-BR → number: remove pontos de milhar, vírgula vira ponto decimal. */
function parseNum(v: FormDataEntryValue | null): number | null {
  if (v === null) return null
  const s = String(v).trim().replace(/\./g, "").replace(",", ".")
  if (s === "") return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function mesValidoFn(m: string): m is Mes {
  return (MESES as readonly string[]).includes(m)
}

function limparOverrides(
  raw: Record<string, unknown> | null | undefined
): MetaOverride {
  const limpo: MetaOverride = {}
  for (const [k, v] of Object.entries(raw ?? {})) {
    if (typeof v === "number" && Number.isFinite(v)) limpo[k] = v
  }
  return limpo
}

/** Metas (overrides) de UM cliente, por mês, para um ano+origem. */
export async function getMetasOverrideCliente(
  clienteId: string,
  ano: number,
  origem: OrigemDadosReais = ORIGEM_PADRAO
): Promise<Map<string, MetaOverride>> {
  const supabase = getSupabaseAdmin()
  if (!supabase || !UUID_RE.test(clienteId)) return new Map()
  const { data, error } = await supabase
    .from("metas_cliente")
    .select("mes, overrides")
    .eq("cliente_id", clienteId)
    .eq("ano", ano)
    .eq("origem", origem)
  if (error) {
    console.error("[metas_cliente] get error", error.message)
    return new Map()
  }
  const map = new Map<string, MetaOverride>()
  for (const row of (data ?? []) as {
    mes: string
    overrides: Record<string, unknown>
  }[]) {
    map.set(row.mes, limparOverrides(row.overrides))
  }
  return map
}

/**
 * Lote: overrides de TODOS os clientes para um mes/ano/origem, agrupados por
 * cliente_id. A página filtra pelos clientes que já lista (por assessoria).
 * Evita N queries (1 por cliente).
 */
export async function getOverridesTodosClientesMes(
  mes: Mes,
  ano: number,
  origem: OrigemDadosReais = ORIGEM_PADRAO
): Promise<Map<string, MetaOverride>> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return new Map()
  const { data, error } = await supabase
    .from("metas_cliente")
    .select("cliente_id, overrides")
    .eq("mes", mes)
    .eq("ano", ano)
    .eq("origem", origem)
  if (error) {
    console.error("[metas_cliente] get por mes error", error.message)
    return new Map()
  }
  const map = new Map<string, MetaOverride>()
  for (const row of (data ?? []) as {
    cliente_id: string
    overrides: Record<string, unknown>
  }[]) {
    map.set(row.cliente_id, limparOverrides(row.overrides))
  }
  return map
}

export async function salvarMetaClienteAction(
  formData: FormData
): Promise<ResultadoMeta> {
  const clienteId = String(formData.get("cliente_id") ?? "").trim()
  const mes = String(formData.get("mes") ?? "")
  const anoRaw = String(formData.get("ano") ?? "")
  const ano = parseInt(anoRaw, 10) || new Date().getFullYear()
  const origem = origemValida(formData.get("origem")?.toString())

  if (!UUID_RE.test(clienteId) || !mesValidoFn(mes)) {
    return { ok: false, erro: "Cliente ou mês inválidos." }
  }

  // Mesma whitelist de metas_empresa — a UI envia só as chaves da origem
  // selecionada, então a persistência fica coerente por origem.
  const CAMPOS: string[] = [
    "verba",
    "criativos",
    "criativos_semana",
    "respostas",
    "agendamentos",
    "leads",
    "reunioes",
    "orcamentos",
    "contratos",
    "vendas",
    "clientes",
    "ticket",
    "churn",
    "influenciadores",
    "vendas_influenciador",
    "vendas_direto",
    "total_vendas",
    "custo_influenciadores",
    "faturamento",
    "receita",
    "faturamento_diego",
    "percentual",
    "receita_hub",
  ]

  const overrides: MetaOverride = {}
  for (const campo of CAMPOS) {
    const v = parseNum(formData.get(campo))
    if (v !== null) overrides[campo] = v
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) return { ok: false, erro: "Supabase indisponível." }

  const { error } = await supabase.from("metas_cliente").upsert(
    {
      cliente_id: clienteId,
      mes,
      ano,
      origem,
      overrides,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "cliente_id,mes,ano,origem" }
  )
  if (error) return { ok: false, erro: error.message }

  revalidatePath("/dashboard/metas")
  revalidatePath("/dashboard", "layout")
  return { ok: true }
}

// ============================================================
// Painel "Metas por cliente" do /dashboard/metas
// ============================================================

export interface PainelMetasCliente {
  /** Metas pago por mês do ano (alimenta o editor DrawerEditarMeta). */
  pagoPorMes: Record<string, MetaOverride>
  /** Metas orgânico por mês do ano. */
  orgPorMes: Record<string, MetaOverride>
  /** Realizado PAGO do período (tráfego) — pra comparação. */
  realizadoPago: { investimento: number; leads: number }
  /** Realizado ORGÂNICO do período (comercial) — null se sem lançamentos. */
  realizadoOrg: RealizadoOrganicoCliente | null
}

/**
 * Tudo que o drawer "Metas por cliente" precisa de UM cliente: metas
 * pago/orgânico do ano (por mês, pro editor) + realizado do período pra
 * comparação (pago do tráfego via getResumoMesCliente, orgânico do comercial
 * via getRealizadoOrganicoDoCliente). Chamado sob demanda quando um cliente é
 * selecionado. UUID inválido / cliente inexistente → tudo zerado, nunca lança.
 */
export async function getPainelMetasCliente(
  clienteId: string,
  de: string,
  ate: string,
  ano: number
): Promise<PainelMetasCliente> {
  const vazio: PainelMetasCliente = {
    pagoPorMes: {},
    orgPorMes: {},
    realizadoPago: { investimento: 0, leads: 0 },
    realizadoOrg: null,
  }
  if (!UUID_RE.test(clienteId)) return vazio

  const cliente = await getClientePorId(clienteId)
  const [pagoMap, orgMap, realizadoOrg, resumoPago] = await Promise.all([
    getMetasOverrideCliente(clienteId, ano, "pago"),
    getMetasOverrideCliente(clienteId, ano, "organico"),
    getRealizadoOrganicoDoCliente(clienteId, de, ate),
    cliente ? getResumoMesCliente(cliente, de, ate) : Promise.resolve(null),
  ])

  return {
    pagoPorMes: Object.fromEntries(pagoMap),
    orgPorMes: Object.fromEntries(orgMap),
    realizadoPago: {
      investimento: resumoPago?.investimento ?? 0,
      leads: resumoPago?.leads ?? 0,
    },
    realizadoOrg,
  }
}

// ============================================================
// Dashboard de Metas POR CLIENTE (/dashboard/[empresa]/metas[/cliente]).
// Espelha o fluxo de Tráfego por cliente: lista (cards meta×realizado) +
// detalhe (CenarioReal + gráfico + tabela/editor). Reutiliza o realizado
// do tráfego (pago) e do comercial (orgânico), como o dashboard da empresa.
// ============================================================

// Abril=4 … Dezembro=12 → índice em MESES (que começa em Abril). Jan–Mar
// não existem em MESES (mesma convenção do resto do app) e são ignorados.
function mesPorNumero(m: number): Mes | undefined {
  return MESES[m - 4]
}

const zeroOuNum = (n: number) => (n > 0 ? n : null)

/**
 * Realizado de UM cliente no período, no shape DadosReais (alimenta o
 * CenarioReal do detalhe). PAGO = investimento/leads do tráfego +
 * reuniões/contratos/faturamento do comercial 'Anúncios' ("comercial vira a
 * conversão", igual ao dashboard da empresa). ORGÂNICO = 100% do comercial.
 * Retorna null quando não há nada no período (deixa o "Não inserido" na UI).
 */
export async function getRealizadoClienteComoDadosReais(
  cliente: ClienteTrafego,
  de: string,
  ate: string,
  mes: Mes,
  ano: number,
  origem: OrigemDadosReais
): Promise<DadosReais | null> {
  if (origem === "organico") {
    const org = await getRealizadoOrganicoDoCliente(cliente.id, de, ate, "organico")
    if (!org) return null
    return {
      empresa: cliente.empresa_nome,
      mes,
      ano,
      origem: "organico",
      investimento_real: null,
      leads_real: zeroOuNum(org.leads),
      reunioes_agendadas_real: null,
      reunioes_real: zeroOuNum(org.reunioes),
      contratos_real: zeroOuNum(org.contratos),
      faturamento_real: zeroOuNum(org.faturamento),
      criativos_entregues: null,
      cpl_real: null,
      respostas: null,
      observacoes: null,
      clientes_ativos: null,
    }
  }

  const [resumoPago, comPago] = await Promise.all([
    getResumoMesCliente(cliente, de, ate),
    getRealizadoOrganicoDoCliente(cliente.id, de, ate, "pago"),
  ])
  const investimento = resumoPago.investimento
  const leads = resumoPago.leads
  const reunioes = comPago?.reunioes ?? 0
  const contratos = comPago?.contratos ?? 0
  const faturamento = comPago?.faturamento ?? 0
  if (
    investimento <= 0 &&
    leads <= 0 &&
    reunioes <= 0 &&
    contratos <= 0 &&
    faturamento <= 0
  ) {
    return null
  }
  return {
    empresa: cliente.empresa_nome,
    mes,
    ano,
    origem: "pago",
    investimento_real: zeroOuNum(investimento),
    leads_real: zeroOuNum(leads),
    reunioes_real: zeroOuNum(reunioes),
    contratos_real: zeroOuNum(contratos),
    faturamento_real: zeroOuNum(faturamento),
    criativos_entregues: null,
    cpl_real: leads > 0 ? investimento / leads : null,
    cpa_real: contratos > 0 ? investimento / contratos : null,
    observacoes: null,
    clientes_ativos: null,
  }
}

/**
 * Faturamento realizado de UM cliente por mês do ano (comercial vinculado),
 * para a linha "real" do gráfico do detalhe. Uma query, agrega em memória.
 */
export async function getRealizadoAnualClienteFaturamento(
  clienteId: string,
  ano: number,
  origem: OrigemDadosReais
): Promise<Map<Mes, number>> {
  const out = new Map<Mes, number>()
  const supabase = getSupabaseAdmin()
  if (!supabase || !UUID_RE.test(clienteId)) return out
  // PAGO usa comercial 'Anúncios'; ORGÂNICO usa comercial orgânico.
  const origemComercial = origem === "pago" ? "pago" : "organico"
  const { data, error } = await supabase
    .from("relatorios_comerciais")
    .select("data, faturamento_gerado")
    .eq("cliente_trafego_id", clienteId)
    .eq("origem", origemComercial)
    .gte("data", `${ano}-01-01`)
    .lte("data", `${ano}-12-31`)
  if (error) {
    console.error("[metas_cliente] faturamento anual error", error.message)
    return out
  }
  for (const row of (data ?? []) as {
    data: string
    faturamento_gerado: number | null
  }[]) {
    const mes = mesPorNumero(parseInt(row.data.slice(5, 7), 10))
    if (!mes) continue
    out.set(mes, (out.get(mes) ?? 0) + Number(row.faturamento_gerado ?? 0))
  }
  return out
}

export interface ResumoMetaClienteMes {
  cliente: ClienteTrafego
  investimentoReal: number
  leadsReal: number
  faturamentoReal: number
  metaInvestimento: number | null
  metaFaturamento: number | null
}

/** Faturamento realizado (comercial, todas as origens) por cliente no período. */
async function getFaturamentoRealPorCliente(
  clienteIds: string[],
  de: string,
  ate: string
): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  const supabase = getSupabaseAdmin()
  if (!supabase || clienteIds.length === 0) return out
  const { data, error } = await supabase
    .from("relatorios_comerciais")
    .select("cliente_trafego_id, faturamento_gerado")
    .in("cliente_trafego_id", clienteIds)
    .gte("data", de)
    .lte("data", ate)
  if (error) {
    console.error("[metas_cliente] faturamento por cliente error", error.message)
    return out
  }
  for (const row of (data ?? []) as {
    cliente_trafego_id: string | null
    faturamento_gerado: number | null
  }[]) {
    if (!row.cliente_trafego_id) continue
    out.set(
      row.cliente_trafego_id,
      (out.get(row.cliente_trafego_id) ?? 0) + Number(row.faturamento_gerado ?? 0)
    )
  }
  return out
}

/**
 * Resumo meta×realizado de TODOS os clientes de uma assessoria, para a grade
 * de cards do /dashboard/[empresa]/metas. Realizado pago (investimento/leads)
 * vem do tráfego; faturamento realizado do comercial; metas dos overrides do
 * mês (verba/faturamento). Reusa getResumoTodosClientesMes (que já deriva
 * status e roteia modo origem/regex).
 */
export async function getResumoMetasClientesDaEmpresa(
  empresaNome: string,
  de: string,
  ate: string,
  mes: Mes,
  ano: number
): Promise<ResumoMetaClienteMes[]> {
  const [resumos, overPago, overOrg] = await Promise.all([
    getResumoTodosClientesMes(empresaNome, de, ate),
    getOverridesTodosClientesMes(mes, ano, "pago"),
    getOverridesTodosClientesMes(mes, ano, "organico"),
  ])
  if (resumos.length === 0) return []
  const fatPorCliente = await getFaturamentoRealPorCliente(
    resumos.map((r) => r.cliente.id),
    de,
    ate
  )
  return resumos.map(({ cliente, investimento, leads }) => {
    const ovP = overPago.get(cliente.id) ?? {}
    const ovO = overOrg.get(cliente.id) ?? {}
    return {
      cliente,
      investimentoReal: investimento,
      leadsReal: leads,
      faturamentoReal: fatPorCliente.get(cliente.id) ?? 0,
      metaInvestimento: ovP.verba ?? null,
      // Meta de faturamento: pago tem prioridade; cai pro orgânico se não houver.
      metaFaturamento: ovP.faturamento ?? ovO.faturamento ?? null,
    }
  })
}
