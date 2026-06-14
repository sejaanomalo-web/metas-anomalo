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
