"use server"

import { randomBytes } from "crypto"
import { revalidatePath } from "next/cache"
import { getSupabaseAdmin } from "./supabase"
import { getUsuarioAtual } from "./auth"

export interface CrmAtividadeRow {
  id: string
  lead_id: string
  empresa_slug: string
  tipo: string
  titulo: string | null
  corpo: string | null
  agendado_para: string | null
  agendado_fim: string | null
  concluido_em: string | null
  lembrete_em: string | null
  autor_nome: string | null
  created_at: string
  lead_nome: string | null
  lead_telefone: string | null
  lead_empresa_nome: string | null
}

export interface ResultadoAtividade {
  ok: boolean
  erro?: string
}

function normalizarAtividade(row: Record<string, any>): CrmAtividadeRow {
  const lead = Array.isArray(row.lead) ? row.lead[0] : row.lead
  const { lead: _omit, ...resto } = row
  return {
    ...(resto as CrmAtividadeRow),
    lead_nome: (lead?.nome as string) ?? null,
    lead_telefone: (lead?.telefone_e164 as string) ?? null,
    lead_empresa_nome: (lead?.empresa_nome as string) ?? null,
  }
}

/** Atividades com data marcada (calendário), dentro do intervalo — do
 *  usuário logado. */
export async function listarAtividadesCalendario(
  inicioIso: string,
  fimIso: string
): Promise<CrmAtividadeRow[]> {
  const usuario = await getUsuarioAtual()
  if (!usuario) return []
  const db = getSupabaseAdmin()
  if (!db) return []
  const { data, error } = await db
    .from("crm_atividades")
    .select("*, lead:crm_leads(nome, telefone_e164, empresa_nome)")
    .eq("usuario_id", usuario.id)
    .not("agendado_para", "is", null)
    .gte("agendado_para", inicioIso)
    .lte("agendado_para", fimIso)
    .order("agendado_para", { ascending: true })
  if (error) {
    console.error("[crm_atividades] listar calendario error", error.message)
    return []
  }
  return (data ?? []).map(normalizarAtividade)
}

export async function listarAtividadesDoLead(
  leadId: string
): Promise<CrmAtividadeRow[]> {
  const usuario = await getUsuarioAtual()
  if (!usuario) return []
  const db = getSupabaseAdmin()
  if (!db) return []
  const { data, error } = await db
    .from("crm_atividades")
    .select("*, lead:crm_leads(nome, telefone_e164, empresa_nome)")
    .eq("lead_id", leadId)
    .eq("usuario_id", usuario.id)
    .order("agendado_para", { ascending: true, nullsFirst: false })
  if (error) {
    console.error("[crm_atividades] listar do lead error", error.message)
    return []
  }
  return (data ?? []).map(normalizarAtividade)
}

/** Cria um follow-up (vira card no calendário; lembrete_em = agendado_para
 *  no MVP — um único campo de data pro usuário escolher "quando lembrar"). */
export async function criarFollowUpAction(
  formData: FormData
): Promise<ResultadoAtividade> {
  const usuario = await getUsuarioAtual()
  if (!usuario) return { ok: false, erro: "Sessão expirada." }
  const db = getSupabaseAdmin()
  if (!db) return { ok: false, erro: "Supabase indisponível." }

  const leadId = String(formData.get("lead_id") ?? "").trim()
  const titulo = String(formData.get("titulo") ?? "").trim()
  const corpo = String(formData.get("corpo") ?? "").trim() || null
  const agendadoParaBruto = String(formData.get("agendado_para") ?? "")
  if (!leadId) return { ok: false, erro: "Lead inválido." }
  if (!agendadoParaBruto) return { ok: false, erro: "Escolha uma data." }

  const agendadoData = new Date(agendadoParaBruto)
  if (Number.isNaN(agendadoData.getTime())) {
    return { ok: false, erro: "Data inválida." }
  }
  const agendadoIso = agendadoData.toISOString()

  const { data: lead } = await db
    .from("crm_leads")
    .select("id, empresa_slug")
    .eq("id", leadId)
    .eq("usuario_id", usuario.id)
    .maybeSingle()
  if (!lead) return { ok: false, erro: "Lead não encontrado." }

  const { error } = await db.from("crm_atividades").insert({
    lead_id: leadId,
    empresa_slug: lead.empresa_slug,
    usuario_id: usuario.id,
    tipo: "tarefa",
    titulo: titulo || "Follow-up",
    corpo,
    agendado_para: agendadoIso,
    lembrete_em: agendadoIso,
    autor_id: usuario.id,
    autor_nome: usuario.nome,
  })
  if (error) return { ok: false, erro: error.message }

  revalidatePath("/dashboard/crm")
  return { ok: true }
}

export async function concluirAtividadeAction(
  formData: FormData
): Promise<ResultadoAtividade> {
  const usuario = await getUsuarioAtual()
  if (!usuario) return { ok: false, erro: "Sessão expirada." }
  const db = getSupabaseAdmin()
  if (!db) return { ok: false, erro: "Supabase indisponível." }

  const id = String(formData.get("id") ?? "").trim()
  if (!id) return { ok: false, erro: "ID inválido." }

  const { error } = await db
    .from("crm_atividades")
    .update({ concluido_em: new Date().toISOString() })
    .eq("id", id)
    .eq("usuario_id", usuario.id)
  if (error) return { ok: false, erro: error.message }

  revalidatePath("/dashboard/crm")
  return { ok: true }
}

export async function excluirAtividadeAction(
  formData: FormData
): Promise<ResultadoAtividade> {
  const usuario = await getUsuarioAtual()
  if (!usuario) return { ok: false, erro: "Sessão expirada." }
  const db = getSupabaseAdmin()
  if (!db) return { ok: false, erro: "Supabase indisponível." }

  const id = String(formData.get("id") ?? "").trim()
  if (!id) return { ok: false, erro: "ID inválido." }

  const { error } = await db
    .from("crm_atividades")
    .delete()
    .eq("id", id)
    .eq("usuario_id", usuario.id)
  if (error) return { ok: false, erro: error.message }

  revalidatePath("/dashboard/crm")
  return { ok: true }
}

/**
 * Gera (ou reaproveita) o token opaco de assinatura do calendário ICS do
 * usuário. Retorna só o token — a URL completa (com domínio) é montada no
 * client via window.location.origin, pra não depender de env var de app URL.
 */
export async function gerarLinkCalendarioAction(): Promise<{
  ok: boolean
  token?: string
  erro?: string
}> {
  const usuario = await getUsuarioAtual()
  if (!usuario) return { ok: false, erro: "Sessão expirada." }
  const db = getSupabaseAdmin()
  if (!db) return { ok: false, erro: "Supabase indisponível." }

  const { data: atual } = await db
    .from("usuarios")
    .select("crm_calendario_token")
    .eq("id", usuario.id)
    .maybeSingle()

  let token = atual?.crm_calendario_token as string | null
  if (!token) {
    token = randomBytes(24).toString("hex")
    const { error } = await db
      .from("usuarios")
      .update({ crm_calendario_token: token })
      .eq("id", usuario.id)
    if (error) return { ok: false, erro: error.message }
  }

  return { ok: true, token }
}
