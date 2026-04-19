"use server"

import { revalidatePath } from "next/cache"
import { getSupabase, supabaseConfigurado } from "./supabase"
import { empresas as empresasHardcoded, type EmpresaMeta, type TipoFunil } from "./data"

export interface EmpresaConfigRow {
  id?: string
  slug: string
  db: string
  nome: string
  tipo: TipoFunil
  subtitulo: string | null
  inicio_em: string | null
  cpl: number | null
  ticket_medio_projetado: number | null
  conversao_lead_reuniao: number | null
  conversao_reuniao_fechamento: number | null
  conversao_lead_orcamento: number | null
  conversao_orcamento_venda: number | null
  ativa: boolean
  ordem: number
  created_at?: string
  updated_at?: string
}

export interface ResultadoEmpresa {
  ok: boolean
  erro?: string
  slug?: string
}

function rowToEmpresa(row: EmpresaConfigRow): EmpresaMeta {
  return {
    id: row.id,
    slug: row.slug,
    db: row.db,
    nome: row.nome,
    tipo: row.tipo,
    subtitulo: row.subtitulo ?? undefined,
    ativa: row.ativa,
    inicioEm: (row.inicio_em ?? undefined) as EmpresaMeta["inicioEm"],
    cpl: row.cpl ?? undefined,
    ticketMedioProjetado: row.ticket_medio_projetado ?? undefined,
    conversaoLeadReuniao: row.conversao_lead_reuniao ?? undefined,
    conversaoReuniaoFechamento: row.conversao_reuniao_fechamento ?? undefined,
    conversaoLeadOrcamento: row.conversao_lead_orcamento ?? undefined,
    conversaoOrcamentoVenda: row.conversao_orcamento_venda ?? undefined,
  }
}

function slugify(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

function dbify(slug: string): string {
  return slug.replace(/-/g, "_")
}

/**
 * Retorna todas as empresas (ativas e inativas).
 * Fallback para lista hardcoded quando Supabase não responder.
 */
export async function listarEmpresas(apenasAtivas = true): Promise<EmpresaMeta[]> {
  const supabase = getSupabase()
  if (!supabase) return apenasAtivas ? empresasHardcoded : empresasHardcoded

  let query = supabase.from("empresas_config").select("*").order("ordem")
  if (apenasAtivas) query = query.eq("ativa", true)

  const { data, error } = await query
  if (error) {
    console.error("[empresas_config] list error", error.message)
    return empresasHardcoded
  }
  if (!data || data.length === 0) return empresasHardcoded

  return (data as EmpresaConfigRow[]).map(rowToEmpresa)
}

export async function listarEmpresasInativas(): Promise<EmpresaMeta[]> {
  const supabase = getSupabase()
  if (!supabase) return []
  const { data, error } = await supabase
    .from("empresas_config")
    .select("*")
    .eq("ativa", false)
    .order("ordem")
  if (error) {
    console.error("[empresas_config] list inativas error", error.message)
    return []
  }
  return (data ?? []).map((r) => rowToEmpresa(r as EmpresaConfigRow))
}

export async function getEmpresaAsync(
  slug: string
): Promise<EmpresaMeta | undefined> {
  const supabase = getSupabase()
  if (supabase) {
    const { data } = await supabase
      .from("empresas_config")
      .select("*")
      .eq("slug", slug)
      .maybeSingle()
    if (data) return rowToEmpresa(data as EmpresaConfigRow)
  }
  return empresasHardcoded.find((e) => e.slug === slug)
}

function validarTipo(tipo: string): tipo is TipoFunil {
  return (
    tipo === "leads-reunioes-contratos" ||
    tipo === "hato" ||
    tipo === "aton" ||
    tipo === "diego"
  )
}

export async function criarEmpresaAction(
  formData: FormData
): Promise<ResultadoEmpresa> {
  if (!supabaseConfigurado()) {
    return { ok: false, erro: "Supabase não configurado." }
  }
  const nome = String(formData.get("nome") ?? "").trim()
  const tipoRaw = String(formData.get("tipo") ?? "")
  const subtitulo = String(formData.get("subtitulo") ?? "").trim() || null

  if (!nome) return { ok: false, erro: "Nome obrigatório." }
  if (!validarTipo(tipoRaw)) return { ok: false, erro: "Tipo inválido." }

  const supabase = getSupabase()
  if (!supabase) return { ok: false, erro: "Supabase indisponível." }

  const slug = slugify(nome)
  const db = dbify(slug)

  if (!slug) return { ok: false, erro: "Nome inválido." }

  // Checa duplicatas
  const { data: existente } = await supabase
    .from("empresas_config")
    .select("slug")
    .or(`slug.eq.${slug},db.eq.${db}`)
    .maybeSingle()
  if (existente) {
    return { ok: false, erro: `Já existe uma empresa com slug "${slug}".` }
  }

  const payload: Partial<EmpresaConfigRow> = {
    slug,
    db,
    nome,
    tipo: tipoRaw,
    subtitulo,
    ativa: true,
    ordem: 999,
  }

  const { error } = await supabase.from("empresas_config").insert(payload)
  if (error) {
    console.error("[empresas_config] insert error", error.message)
    return { ok: false, erro: error.message }
  }

  revalidatePath("/dashboard")
  revalidatePath(`/dashboard/${slug}`)
  return { ok: true, slug }
}

export async function atualizarEmpresaAction(
  formData: FormData
): Promise<ResultadoEmpresa> {
  if (!supabaseConfigurado()) {
    return { ok: false, erro: "Supabase não configurado." }
  }
  const id = String(formData.get("id") ?? "").trim()
  const nome = String(formData.get("nome") ?? "").trim()
  const tipoRaw = String(formData.get("tipo") ?? "")
  const subtitulo = String(formData.get("subtitulo") ?? "").trim() || null

  if (!id) return { ok: false, erro: "ID inválido." }
  if (!nome) return { ok: false, erro: "Nome obrigatório." }
  if (!validarTipo(tipoRaw)) return { ok: false, erro: "Tipo inválido." }

  const supabase = getSupabase()
  if (!supabase) return { ok: false, erro: "Supabase indisponível." }

  const { data: atual } = await supabase
    .from("empresas_config")
    .select("slug")
    .eq("id", id)
    .maybeSingle()

  const { error } = await supabase
    .from("empresas_config")
    .update({
      nome,
      tipo: tipoRaw,
      subtitulo,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
  if (error) return { ok: false, erro: error.message }

  revalidatePath("/dashboard")
  if (atual?.slug) revalidatePath(`/dashboard/${atual.slug}`)
  return { ok: true, slug: atual?.slug }
}

export async function desativarEmpresaAction(
  formData: FormData
): Promise<ResultadoEmpresa> {
  if (!supabaseConfigurado()) {
    return { ok: false, erro: "Supabase não configurado." }
  }
  const id = String(formData.get("id") ?? "").trim()
  if (!id) return { ok: false, erro: "ID inválido." }

  const supabase = getSupabase()
  if (!supabase) return { ok: false, erro: "Supabase indisponível." }

  const { error } = await supabase
    .from("empresas_config")
    .update({ ativa: false, updated_at: new Date().toISOString() })
    .eq("id", id)
  if (error) return { ok: false, erro: error.message }

  revalidatePath("/dashboard")
  return { ok: true }
}

export async function reativarEmpresaAction(
  formData: FormData
): Promise<ResultadoEmpresa> {
  if (!supabaseConfigurado()) {
    return { ok: false, erro: "Supabase não configurado." }
  }
  const id = String(formData.get("id") ?? "").trim()
  if (!id) return { ok: false, erro: "ID inválido." }

  const supabase = getSupabase()
  if (!supabase) return { ok: false, erro: "Supabase indisponível." }

  const { error } = await supabase
    .from("empresas_config")
    .update({ ativa: true, updated_at: new Date().toISOString() })
    .eq("id", id)
  if (error) return { ok: false, erro: error.message }

  revalidatePath("/dashboard")
  return { ok: true }
}

/**
 * Exclusão permanente. Bloqueia se houver histórico em dados_reais ou
 * metas_empresa — nesses casos, usar desativar.
 */
export async function excluirEmpresaAction(
  formData: FormData
): Promise<ResultadoEmpresa> {
  if (!supabaseConfigurado()) {
    return { ok: false, erro: "Supabase não configurado." }
  }
  const id = String(formData.get("id") ?? "").trim()
  const db = String(formData.get("db") ?? "").trim()
  if (!id || !db) return { ok: false, erro: "ID ou db inválido." }

  const supabase = getSupabase()
  if (!supabase) return { ok: false, erro: "Supabase indisponível." }

  // Bloqueia se tem histórico
  const { data: dados } = await supabase
    .from("dados_reais")
    .select("id")
    .eq("empresa", db)
    .limit(1)
  if (dados && dados.length > 0) {
    return {
      ok: false,
      erro:
        "Esta empresa tem histórico de dados reais. Use Desativar para preservar o histórico.",
    }
  }
  const { data: metas } = await supabase
    .from("metas_empresa")
    .select("id")
    .eq("empresa", db)
    .limit(1)
  if (metas && metas.length > 0) {
    return {
      ok: false,
      erro:
        "Esta empresa tem metas editadas. Use Desativar para preservar o histórico.",
    }
  }

  const { error } = await supabase
    .from("empresas_config")
    .delete()
    .eq("id", id)
  if (error) return { ok: false, erro: error.message }

  revalidatePath("/dashboard")
  return { ok: true }
}
