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

export interface IdentidadeEscrita {
  id: string | null
  nome: string
}

/**
 * Helper único de escrita em dados_reais. Garante atomicidade lógica
 * entre o estado mensal (dados_reais) e a trilha de auditoria
 * (dados_diarios_log):
 *   1. Lê o estado anterior daquela linha
 *   2. Faz upsert do novo estado
 *   3. Registra delta no log com identidade do preenchedor
 *
 * Toda escrita em dados_reais que vier do app deve passar por aqui —
 * isso evita divergência entre o dashboard (que lê dados_reais) e os
 * resumos diário/semanal (que somam deltas do log). Se for adicionar
 * uma terceira action que escreve em dados_reais, use esta helper.
 */
export async function gravarDadosReaisComLog(
  payload: DadosReais,
  identidade: IdentidadeEscrita
): Promise<{ ok: boolean; erro?: string; anterior: DadosReais | null }> {
  const supabase = getSupabase()
  if (!supabase) {
    return { ok: false, erro: "Supabase indisponível.", anterior: null }
  }

  const { data: anteriorRow } = await supabase
    .from("dados_reais")
    .select("*")
    .eq("empresa", payload.empresa)
    .eq("mes", payload.mes)
    .eq("ano", payload.ano)
    .eq("origem", payload.origem ?? ORIGEM_PADRAO)
    .maybeSingle()
  const anterior = (anteriorRow ?? null) as DadosReais | null

  const { error: erroUpsert } = await supabase
    .from("dados_reais")
    .upsert(payload, { onConflict: "empresa,mes,ano,origem" })
  if (erroUpsert) {
    console.error("[dados_reais] upsert error", erroUpsert.message)
    return { ok: false, erro: erroUpsert.message, anterior }
  }

  const log = {
    empresa: payload.empresa,
    data: new Date().toISOString().slice(0, 10),
    origem: payload.origem ?? ORIGEM_PADRAO,
    preenchedor_id: identidade.id,
    preenchedor_nome: identidade.nome,
    investimento_real: payload.investimento_real,
    leads_real: payload.leads_real,
    reunioes_real: payload.reunioes_real,
    contratos_real: payload.contratos_real,
    faturamento_real: payload.faturamento_real,
    criativos_entregues: payload.criativos_entregues,
    clientes_ativos: payload.clientes_ativos,
    observacoes: payload.observacoes,
    cpl_real: payload.cpl_real,
    cpa_real: payload.cpa_real ?? null,
    criativos_usados: payload.criativos_usados ?? null,
    criativos_detalhe: payload.criativos_detalhe ?? null,
    respostas: payload.respostas ?? null,
    publicos_prospectados: payload.publicos_prospectados ?? null,
    investimento_anterior: anterior?.investimento_real ?? null,
    leads_anterior: anterior?.leads_real ?? null,
    reunioes_anterior: anterior?.reunioes_real ?? null,
    contratos_anterior: anterior?.contratos_real ?? null,
    faturamento_anterior: anterior?.faturamento_real ?? null,
    criativos_anterior: anterior?.criativos_entregues ?? null,
    cpl_anterior: anterior?.cpl_real ?? null,
    cpa_anterior: anterior?.cpa_real ?? null,
    criativos_usados_anterior: anterior?.criativos_usados ?? null,
    criativos_detalhe_anterior: anterior?.criativos_detalhe ?? null,
    respostas_anterior: anterior?.respostas ?? null,
    publicos_prospectados_anterior:
      anterior?.publicos_prospectados ?? null,
  }
  const { error: erroLog } = await supabase
    .from("dados_diarios_log")
    .insert(log)
  if (erroLog) {
    // Log é trilha de auditoria, não bloqueia a gravação principal —
    // mas avisa em runtime caso a inserção falhe.
    console.error("[dados_diarios_log] insert error", erroLog.message)
  }

  return { ok: true, anterior }
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

  const resultado = await gravarDadosReaisComLog(payload, {
    id: null,
    nome: "Drawer admin",
  })
  if (!resultado.ok) {
    return { ok: false, erro: resultado.erro }
  }

  const empresaMeta = getEmpresaPorDb(empresa)
  if (empresaMeta) {
    revalidatePath(`/dashboard/${empresaMeta.slug}`)
  }
  revalidatePath("/dashboard")

  return { ok: true }
}
