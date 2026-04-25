"use server"

import { revalidatePath } from "next/cache"
import {
  type DadosReais,
  getSupabase,
  supabaseConfigurado,
} from "./supabase"
import {
  ANO_PADRAO,
  ORIGEM_PADRAO,
  type EmpresaDb,
  type Mes,
  MESES,
  type OrigemDadosReais,
  empresas,
  getEmpresaPorDb,
  origemValida,
} from "./data"

export interface DadosReaisPorOrigem {
  pago: DadosReais | null
  organico: DadosReais | null
}

function parseNumero(v: FormDataEntryValue | null): number | null {
  if (v === null) return null
  const s = String(v).trim().replace(/\./g, "").replace(",", ".")
  if (s === "") return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function parseInt0(v: FormDataEntryValue | null): number | null {
  if (v === null) return null
  const s = String(v).trim()
  if (s === "") return null
  const n = parseInt(s, 10)
  return Number.isFinite(n) ? n : null
}

function empresaValida(empresa: string): empresa is EmpresaDb {
  // Aceita qualquer identificador válido — empresas criadas via UI não
  // estão na lista hardcoded `empresas`.
  return /^[a-z0-9_-]+$/i.test(empresa) && empresa.length > 0
}

function mesValido(mes: string): mes is Mes {
  return (MESES as readonly string[]).includes(mes)
}

export async function getDadosReais(
  empresa: EmpresaDb,
  ano: number = ANO_PADRAO,
  origem: OrigemDadosReais = ORIGEM_PADRAO
): Promise<DadosReais[]> {
  const supabase = getSupabase()
  if (!supabase) return []
  const { data, error } = await supabase
    .from("dados_reais")
    .select("*")
    .eq("empresa", empresa)
    .eq("ano", ano)
    .eq("origem", origem)
  if (error) {
    console.error("[dados_reais] get error", error.message)
    return []
  }
  return (data ?? []) as DadosReais[]
}

export async function getDadosReaisMes(
  empresa: EmpresaDb,
  mes: Mes,
  ano: number = ANO_PADRAO,
  origem: OrigemDadosReais = ORIGEM_PADRAO
): Promise<DadosReais | null> {
  const supabase = getSupabase()
  if (!supabase) return null
  const { data, error } = await supabase
    .from("dados_reais")
    .select("*")
    .eq("empresa", empresa)
    .eq("ano", ano)
    .eq("mes", mes)
    .eq("origem", origem)
    .maybeSingle()
  if (error) {
    console.error("[dados_reais] getMes error", error.message)
    return null
  }
  return (data ?? null) as DadosReais | null
}

export async function getDadosReaisDoMes(
  mes: Mes,
  ano: number = ANO_PADRAO
): Promise<Map<string, DadosReaisPorOrigem>> {
  const supabase = getSupabase()
  if (!supabase) return new Map()
  const { data, error } = await supabase
    .from("dados_reais")
    .select("*")
    .eq("mes", mes)
    .eq("ano", ano)
  if (error) {
    console.error("[dados_reais] getDoMes error", error.message)
    return new Map()
  }
  const map = new Map<string, DadosReaisPorOrigem>()
  for (const d of (data ?? []) as DadosReais[]) {
    const bucket = map.get(d.empresa) ?? { pago: null, organico: null }
    if (d.origem === "organico") {
      bucket.organico = d
    } else {
      bucket.pago = d
    }
    map.set(d.empresa, bucket)
  }
  return map
}

export async function getMesesComDadosReais(
  ano: number = ANO_PADRAO
): Promise<Set<string>> {
  const supabase = getSupabase()
  if (!supabase) return new Set()
  const { data, error } = await supabase
    .from("dados_reais")
    .select("empresa, mes")
    .eq("ano", ano)
  if (error) {
    console.error("[dados_reais] getMesesComDados error", error.message)
    return new Set()
  }
  const s = new Set<string>()
  for (const d of data ?? []) {
    s.add(`${d.empresa}:${d.mes}`)
  }
  return s
}

export interface ResultadoSalvar {
  ok: boolean
  erro?: string
}

export async function salvarDadosReaisAction(
  formData: FormData
): Promise<ResultadoSalvar> {
  if (!supabaseConfigurado()) {
    return {
      ok: false,
      erro: "Supabase não configurado. Defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    }
  }

  const empresa = String(formData.get("empresa") ?? "")
  const mes = String(formData.get("mes") ?? "")
  const ano = parseInt0(formData.get("ano")) ?? ANO_PADRAO
  const origem = origemValida(String(formData.get("origem") ?? ""))

  if (!empresaValida(empresa) || !mesValido(mes)) {
    return { ok: false, erro: "Empresa ou mês inválidos." }
  }

  const leads_real = parseInt0(formData.get("leads_real"))
  const reunioes_real = parseInt0(formData.get("reunioes_real"))
  const contratos_real = parseInt0(formData.get("contratos_real"))
  const faturamento_real = parseNumero(formData.get("faturamento_real"))
  const observacoes = String(formData.get("observacoes") ?? "").trim() || null
  const clientes_ativos = parseInt0(formData.get("clientes_ativos"))

  // Campos só-pago — orgânico nunca os aceita, mesmo se vierem no FormData.
  const investimento_real =
    origem === "pago" ? parseNumero(formData.get("investimento_real")) : null
  const criativos_entregues =
    origem === "pago" ? parseInt0(formData.get("criativos_entregues")) : null
  const cpl_real =
    origem === "pago" &&
    investimento_real !== null &&
    leads_real !== null &&
    leads_real > 0
      ? Number((investimento_real / leads_real).toFixed(2))
      : null
  // Campos só-orgânico — pago ignora.
  const respostas =
    origem === "organico" ? parseInt0(formData.get("respostas")) : null

  const payload: DadosReais = {
    empresa,
    mes,
    ano,
    origem,
    investimento_real,
    leads_real,
    reunioes_real,
    contratos_real,
    faturamento_real,
    criativos_entregues,
    cpl_real,
    respostas,
    observacoes,
    clientes_ativos,
    updated_at: new Date().toISOString(),
  }

  const supabase = getSupabase()
  if (!supabase) return { ok: false, erro: "Supabase indisponível." }

  const { error } = await supabase
    .from("dados_reais")
    .upsert(payload, { onConflict: "empresa,mes,ano,origem" })

  if (error) {
    console.error("[dados_reais] upsert error", error.message)
    return { ok: false, erro: error.message }
  }

  const empresaMeta = getEmpresaPorDb(empresa)
  if (empresaMeta) {
    revalidatePath(`/dashboard/${empresaMeta.slug}`)
  }
  revalidatePath("/dashboard")

  return { ok: true }
}
