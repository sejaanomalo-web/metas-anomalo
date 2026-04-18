"use server"

import { revalidatePath } from "next/cache"
import {
  type Colaborador,
  type ConfiguracaoComissao,
  type MetaComissionamento,
  getSupabase,
  supabaseConfigurado,
} from "./supabase"
import { ANO_PADRAO, type Mes, MESES } from "./data"

export interface ResultadoConfig {
  ok: boolean
  erro?: string
}

function mesValido(m: string): m is Mes {
  return (MESES as readonly string[]).includes(m)
}

function parseConfiguracao(raw: string): ConfiguracaoComissao | null {
  try {
    const parsed = JSON.parse(raw) as ConfiguracaoComissao
    if (parsed.tipo === "gatilhos" && Array.isArray(parsed.gatilhos)) {
      return { tipo: "gatilhos", gatilhos: parsed.gatilhos }
    }
    if (parsed.tipo === "escala" && Array.isArray(parsed.faixas)) {
      return { tipo: "escala", faixas: parsed.faixas }
    }
    return null
  } catch {
    return null
  }
}

export async function getMetaComissionamento(
  colaborador: string,
  mes: Mes,
  ano: number = ANO_PADRAO
): Promise<MetaComissionamento | null> {
  const supabase = getSupabase()
  if (!supabase) return null
  const { data, error } = await supabase
    .from("metas_comissionamento")
    .select("*")
    .eq("colaborador", colaborador)
    .eq("mes", mes)
    .eq("ano", ano)
    .maybeSingle()
  if (error) {
    console.error("[metas_comissionamento] get error", error.message)
    return null
  }
  return (data ?? null) as MetaComissionamento | null
}

export async function listarMetasDoMes(
  mes: Mes,
  ano: number = ANO_PADRAO
): Promise<Map<string, MetaComissionamento>> {
  const supabase = getSupabase()
  if (!supabase) return new Map()
  const { data, error } = await supabase
    .from("metas_comissionamento")
    .select("*")
    .eq("mes", mes)
    .eq("ano", ano)
  if (error) {
    console.error("[metas_comissionamento] list error", error.message)
    return new Map()
  }
  const map = new Map<string, MetaComissionamento>()
  for (const d of (data ?? []) as MetaComissionamento[]) {
    map.set(d.colaborador, d)
  }
  return map
}

export async function salvarMetaComissaoAction(
  formData: FormData
): Promise<ResultadoConfig> {
  if (!supabaseConfigurado()) {
    return { ok: false, erro: "Supabase não configurado." }
  }
  const colaborador = String(formData.get("colaborador") ?? "").trim()
  const mes = String(formData.get("mes") ?? "")
  const anoRaw = String(formData.get("ano") ?? "")
  const ano = parseInt(anoRaw, 10) || ANO_PADRAO
  const configuracaoRaw = String(formData.get("configuracao") ?? "")
  const configuracao = parseConfiguracao(configuracaoRaw)

  if (!colaborador || !mesValido(mes) || !configuracao) {
    return { ok: false, erro: "Dados inválidos." }
  }

  const supabase = getSupabase()
  if (!supabase) return { ok: false, erro: "Supabase indisponível." }

  const payload: MetaComissionamento = {
    colaborador,
    mes,
    ano,
    configuracao,
    updated_at: new Date().toISOString(),
  }

  const { error } = await supabase
    .from("metas_comissionamento")
    .upsert(payload, { onConflict: "colaborador,mes,ano" })

  if (error) {
    console.error("[metas_comissionamento] upsert error", error.message)
    return { ok: false, erro: error.message }
  }

  revalidatePath("/dashboard/comissionamento")
  return { ok: true }
}

export async function listarColaboradores(
  apenasAtivos = true
): Promise<Colaborador[]> {
  const supabase = getSupabase()
  if (!supabase) return []
  let query = supabase.from("colaboradores").select("*")
  if (apenasAtivos) query = query.eq("ativo", true)
  const { data, error } = await query.order("created_at", { ascending: true })
  if (error) {
    console.error("[colaboradores] list error", error.message)
    return []
  }
  return (data ?? []) as Colaborador[]
}

export async function salvarColaboradorAction(
  formData: FormData
): Promise<ResultadoConfig> {
  if (!supabaseConfigurado()) {
    return { ok: false, erro: "Supabase não configurado." }
  }
  const nome = String(formData.get("nome") ?? "").trim()
  const funcao = String(formData.get("funcao") ?? "").trim()
  const tipoRaw = String(formData.get("tipo") ?? "")
  const configuracaoRaw = String(formData.get("configuracao_padrao") ?? "")
  const configuracao = parseConfiguracao(configuracaoRaw)

  if (!nome || !funcao) {
    return { ok: false, erro: "Nome e função são obrigatórios." }
  }
  if (tipoRaw !== "gatilhos" && tipoRaw !== "escala") {
    return { ok: false, erro: "Tipo inválido." }
  }
  if (!configuracao) {
    return { ok: false, erro: "Configuração inválida." }
  }

  const supabase = getSupabase()
  if (!supabase) return { ok: false, erro: "Supabase indisponível." }

  const payload: Colaborador = {
    nome,
    funcao,
    tipo: tipoRaw,
    configuracao_padrao: configuracao,
    ativo: true,
  }

  const { error } = await supabase.from("colaboradores").insert(payload)
  if (error) {
    console.error("[colaboradores] insert error", error.message)
    return { ok: false, erro: error.message }
  }
  revalidatePath("/dashboard/comissionamento")
  return { ok: true }
}

export async function desativarColaboradorAction(
  formData: FormData
): Promise<ResultadoConfig> {
  if (!supabaseConfigurado()) {
    return { ok: false, erro: "Supabase não configurado." }
  }
  const id = String(formData.get("id") ?? "").trim()
  if (!id) return { ok: false, erro: "ID inválido." }
  const supabase = getSupabase()
  if (!supabase) return { ok: false, erro: "Supabase indisponível." }

  const { error } = await supabase
    .from("colaboradores")
    .update({ ativo: false })
    .eq("id", id)
  if (error) {
    console.error("[colaboradores] desativar error", error.message)
    return { ok: false, erro: error.message }
  }
  revalidatePath("/dashboard/comissionamento")
  return { ok: true }
}
