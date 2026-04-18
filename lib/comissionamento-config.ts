"use server"

import { revalidatePath } from "next/cache"
import {
  type Colaborador,
  type ConfiguracaoComissao,
  type FuncaoTime,
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

  const dataEntradaRaw = String(formData.get("data_entrada") ?? "").trim()
  const observacoes =
    String(formData.get("observacoes") ?? "").trim().slice(0, 120) || null

  const payload: Colaborador = {
    nome,
    funcao,
    tipo: tipoRaw,
    configuracao_padrao: configuracao,
    ativo: true,
    data_entrada: dataEntradaRaw || null,
    observacoes,
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
  const dataEntradaRaw = String(formData.get("data_entrada") ?? "").trim()
  const observacoes =
    String(formData.get("observacoes") ?? "").trim().slice(0, 120) || null
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

  // Captura o nome antigo para propagar renomeação em metas_comissionamento
  // e comissionamento caso o nome mude.
  const { data: atual } = await supabase
    .from("colaboradores")
    .select("nome")
    .eq("id", id)
    .maybeSingle()
  const nomeAntigo = atual?.nome?.toLowerCase() ?? null
  const nomeNovo = nome.toLowerCase()

  const { error } = await supabase
    .from("colaboradores")
    .update({
      nome,
      funcao,
      tipo: tipoRaw,
      configuracao_padrao: configuracao,
      data_entrada: dataEntradaRaw || null,
      observacoes,
    })
    .eq("id", id)
  if (error) return { ok: false, erro: error.message }

  if (nomeAntigo && nomeAntigo !== nomeNovo) {
    await supabase
      .from("metas_comissionamento")
      .update({ colaborador: nomeNovo })
      .eq("colaborador", nomeAntigo)
    await supabase
      .from("comissionamento")
      .update({ colaborador: nomeNovo })
      .eq("colaborador", nomeAntigo)
  }

  revalidatePath("/dashboard/comissionamento")
  revalidatePath("/dashboard")
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

// ============ Funções do time ============

export interface FuncaoComContagem {
  nome: string
  count: number
  persistida: boolean // true se existe em funcoes_time
}

export async function listarFuncoesTime(): Promise<FuncaoComContagem[]> {
  const supabase = getSupabase()
  if (!supabase) return []

  const [{ data: funcoes }, { data: colaboradoresAtivos }] = await Promise.all([
    supabase.from("funcoes_time").select("nome"),
    supabase.from("colaboradores").select("funcao").eq("ativo", true),
  ])

  const persistidas = new Set<string>(
    (funcoes ?? []).map((f: { nome: string }) => f.nome)
  )
  const contagem = new Map<string, number>()
  for (const c of (colaboradoresAtivos ?? []) as { funcao: string }[]) {
    if (!c.funcao) continue
    contagem.set(c.funcao, (contagem.get(c.funcao) ?? 0) + 1)
  }

  const nomesUnicos = new Set<string>([
    ...persistidas,
    ...Array.from(contagem.keys()),
  ])

  const lista: FuncaoComContagem[] = Array.from(nomesUnicos)
    .sort((a, b) => a.localeCompare(b, "pt-BR"))
    .map((nome) => ({
      nome,
      count: contagem.get(nome) ?? 0,
      persistida: persistidas.has(nome),
    }))

  return lista
}

export async function criarFuncaoAction(
  formData: FormData
): Promise<ResultadoConfig> {
  if (!supabaseConfigurado()) {
    return { ok: false, erro: "Supabase não configurado." }
  }
  const nome = String(formData.get("nome") ?? "").trim()
  if (!nome) return { ok: false, erro: "Nome da função é obrigatório." }
  const supabase = getSupabase()
  if (!supabase) return { ok: false, erro: "Supabase indisponível." }

  const payload: FuncaoTime = { nome }
  const { error } = await supabase
    .from("funcoes_time")
    .upsert(payload, { onConflict: "nome", ignoreDuplicates: true })
  if (error) return { ok: false, erro: error.message }

  revalidatePath("/dashboard/comissionamento")
  return { ok: true }
}

export async function renomearFuncaoAction(
  formData: FormData
): Promise<ResultadoConfig> {
  if (!supabaseConfigurado()) {
    return { ok: false, erro: "Supabase não configurado." }
  }
  const antigo = String(formData.get("antigo") ?? "").trim()
  const novo = String(formData.get("novo") ?? "").trim()
  if (!antigo || !novo) return { ok: false, erro: "Nomes inválidos." }
  if (antigo === novo) return { ok: true }

  const supabase = getSupabase()
  if (!supabase) return { ok: false, erro: "Supabase indisponível." }

  // Upsert da nova + update em colaboradores + delete do antigo (se existir)
  const { error: erroInsert } = await supabase
    .from("funcoes_time")
    .upsert({ nome: novo }, { onConflict: "nome", ignoreDuplicates: true })
  if (erroInsert) return { ok: false, erro: erroInsert.message }

  const { error: erroUpdate } = await supabase
    .from("colaboradores")
    .update({ funcao: novo })
    .eq("funcao", antigo)
  if (erroUpdate) return { ok: false, erro: erroUpdate.message }

  await supabase.from("funcoes_time").delete().eq("nome", antigo)

  revalidatePath("/dashboard/comissionamento")
  revalidatePath("/dashboard")
  return { ok: true }
}

export async function excluirFuncaoAction(
  formData: FormData
): Promise<ResultadoConfig> {
  if (!supabaseConfigurado()) {
    return { ok: false, erro: "Supabase não configurado." }
  }
  const nome = String(formData.get("nome") ?? "").trim()
  if (!nome) return { ok: false, erro: "Nome inválido." }
  const supabase = getSupabase()
  if (!supabase) return { ok: false, erro: "Supabase indisponível." }

  const { data: ativos } = await supabase
    .from("colaboradores")
    .select("id")
    .eq("ativo", true)
    .eq("funcao", nome)
    .limit(1)
  if (ativos && ativos.length > 0) {
    return {
      ok: false,
      erro: "Reatribua os colaboradores antes de excluir",
    }
  }

  const { error } = await supabase.from("funcoes_time").delete().eq("nome", nome)
  if (error) return { ok: false, erro: error.message }

  revalidatePath("/dashboard/comissionamento")
  return { ok: true }
}
