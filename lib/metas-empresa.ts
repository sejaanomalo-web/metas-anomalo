"use server"

import { revalidatePath } from "next/cache"
import { getSupabase, supabaseConfigurado } from "./supabase"
import { type EmpresaDb, type Mes, empresas, MESES } from "./data"

export interface ResultadoMeta {
  ok: boolean
  erro?: string
}

export type MetaOverride = Record<string, number>

function parseNum(v: FormDataEntryValue | null): number | null {
  if (v === null) return null
  const s = String(v).trim().replace(/\./g, "").replace(",", ".")
  if (s === "") return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function empresaValida(e: string): e is EmpresaDb {
  return empresas.some((x) => x.db === e)
}

function mesValidoFn(m: string): m is Mes {
  return (MESES as readonly string[]).includes(m)
}

export async function getMetasOverrideEmpresa(
  empresa: EmpresaDb,
  ano: number
): Promise<Map<string, MetaOverride>> {
  const supabase = getSupabase()
  if (!supabase) return new Map()
  const { data, error } = await supabase
    .from("metas_empresa")
    .select("mes, overrides")
    .eq("empresa", empresa)
    .eq("ano", ano)
  if (error) {
    console.error("[metas_empresa] get error", error.message)
    return new Map()
  }
  const map = new Map<string, MetaOverride>()
  for (const row of (data ?? []) as {
    mes: string
    overrides: Record<string, unknown>
  }[]) {
    const limpo: MetaOverride = {}
    for (const [k, v] of Object.entries(row.overrides ?? {})) {
      if (typeof v === "number" && Number.isFinite(v)) limpo[k] = v
    }
    map.set(row.mes, limpo)
  }
  return map
}

export async function salvarMetaEmpresaAction(
  formData: FormData
): Promise<ResultadoMeta> {
  if (!supabaseConfigurado()) {
    return { ok: false, erro: "Supabase não configurado." }
  }

  const empresa = String(formData.get("empresa") ?? "")
  const mes = String(formData.get("mes") ?? "")
  const anoRaw = String(formData.get("ano") ?? "")
  const ano = parseInt(anoRaw, 10) || new Date().getFullYear()

  if (!empresaValida(empresa) || !mesValidoFn(mes)) {
    return { ok: false, erro: "Empresa ou mês inválidos." }
  }

  const CAMPOS: string[] = [
    "verba",
    "criativos",
    "criativos_semana",
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

  const supabase = getSupabase()
  if (!supabase) return { ok: false, erro: "Supabase indisponível." }

  const { error } = await supabase.from("metas_empresa").upsert(
    {
      empresa,
      mes,
      ano,
      overrides,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "empresa,mes,ano" }
  )
  if (error) return { ok: false, erro: error.message }

  const empresaMeta = empresas.find((e) => e.db === empresa)
  if (empresaMeta) revalidatePath(`/dashboard/${empresaMeta.slug}`)
  revalidatePath("/dashboard")
  return { ok: true }
}
