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
import { ESCALA_PADRAO, GATILHOS_PADRAO } from "./comissionamento-presets"

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

export async function listarColaboradoresInativos(): Promise<Colaborador[]> {
  const supabase = getSupabase()
  if (!supabase) return []
  const { data, error } = await supabase
    .from("colaboradores")
    .select("*")
    .eq("ativo", false)
    .order("created_at", { ascending: true })
  if (error) {
    console.error("[colaboradores] list inativos error", error.message)
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
  const mes = String(formData.get("mes") ?? "").trim()
  const anoRaw = String(formData.get("ano") ?? "")
  const ano = parseInt(anoRaw, 10) || new Date().getFullYear()
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

  // Cria bloco de comissionamento para o mês atual se ainda não existir.
  if (mes) {
    const presetConfig: ConfiguracaoComissao =
      tipoRaw === "escala" ? ESCALA_PADRAO : GATILHOS_PADRAO
    const presetPayload: MetaComissionamento = {
      colaborador: nome.toLowerCase(),
      mes,
      ano,
      configuracao: presetConfig,
      updated_at: new Date().toISOString(),
    }
    const { error: erroMeta } = await supabase
      .from("metas_comissionamento")
      .upsert(presetPayload, {
        onConflict: "colaborador,mes,ano",
        ignoreDuplicates: true,
      })
    if (erroMeta) {
      console.error("[metas_comissionamento] preset error", erroMeta.message)
    }
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

export async function reativarColaboradorAction(
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
    .update({ ativo: true })
    .eq("id", id)
  if (error) return { ok: false, erro: error.message }
  revalidatePath("/dashboard/comissionamento")
  return { ok: true }
}

export async function atualizarColaboradorAction(
  formData: FormData
): Promise<ResultadoConfig> {
  if (!supabaseConfigurado()) {
    return { ok: false, erro: "Supabase não configurado." }
  }
  const id = String(formData.get("id") ?? "").trim()
  const nome = String(formData.get("nome") ?? "").trim()
  const funcao = String(formData.get("funcao") ?? "").trim()
  const tipoRaw = String(formData.get("tipo") ?? "")
  const configuracaoRaw = String(formData.get("configuracao_padrao") ?? "")
  const configuracao = parseConfiguracao(configuracaoRaw)

  if (!id) return { ok: false, erro: "ID inválido." }
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

  const { error } = await supabase
    .from("colaboradores")
    .update({
      nome,
      funcao,
      tipo: tipoRaw,
      configuracao_padrao: configuracao,
    })
    .eq("id", id)
  if (error) return { ok: false, erro: error.message }
  revalidatePath("/dashboard/comissionamento")
  return { ok: true }
}

export async function excluirColaboradorAction(
  formData: FormData
): Promise<ResultadoConfig> {
  if (!supabaseConfigurado()) {
    return { ok: false, erro: "Supabase não configurado." }
  }
  const id = String(formData.get("id") ?? "").trim()
  const nome = String(formData.get("nome") ?? "").trim()
  if (!id) return { ok: false, erro: "ID inválido." }
  const supabase = getSupabase()
  if (!supabase) return { ok: false, erro: "Supabase indisponível." }

  // Bloquear se houver histórico de comissionamento.
  if (nome) {
    const { data: historico, error: erroHistorico } = await supabase
      .from("metas_comissionamento")
      .select("id")
      .eq("colaborador", nome.toLowerCase())
      .limit(1)
    if (erroHistorico) {
      return { ok: false, erro: erroHistorico.message }
    }
    if (historico && historico.length > 0) {
      return {
        ok: false,
        erro:
          "Este colaborador tem histórico de comissionamento. Use Desativar para ocultá-lo sem perder o histórico.",
      }
    }
  }

  const { error } = await supabase
    .from("colaboradores")
    .delete()
    .eq("id", id)
  if (error) return { ok: false, erro: error.message }
  revalidatePath("/dashboard/comissionamento")
  return { ok: true }
}
