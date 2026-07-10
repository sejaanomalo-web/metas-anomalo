"use server"

import { revalidatePath } from "next/cache"
import { getSupabaseAdmin } from "./supabase"
import { getUsuarioAtual } from "./auth"
import type { CrmEtiquetaResumo } from "./crm-leads"
import { CORES_ETIQUETA } from "./crm-cores"

export interface ResultadoEtiqueta {
  ok: boolean
  erro?: string
}

function corValida(bruto: string | null): string | null {
  if (!bruto) return null
  return /^#[0-9a-fA-F]{6}$/.test(bruto) ? bruto : null
}

function revalidarCrm() {
  revalidatePath("/dashboard/crm")
}

/** Etiquetas do usuário logado (vocabulário pessoal, igual labels do
 *  WhatsApp Business). */
export async function listarEtiquetas(): Promise<CrmEtiquetaResumo[]> {
  const usuario = await getUsuarioAtual()
  if (!usuario) return []
  const db = getSupabaseAdmin()
  if (!db) return []
  const { data, error } = await db
    .from("crm_etiquetas")
    .select("id, nome, cor")
    .eq("usuario_id", usuario.id)
    .order("nome", { ascending: true })
  if (error) {
    console.error("[crm_etiquetas] list error", error.message)
    return []
  }
  return (data ?? []) as CrmEtiquetaResumo[]
}

export async function criarEtiquetaAction(
  formData: FormData
): Promise<ResultadoEtiqueta & { id?: string }> {
  const usuario = await getUsuarioAtual()
  if (!usuario) return { ok: false, erro: "Sessão expirada." }
  const db = getSupabaseAdmin()
  if (!db) return { ok: false, erro: "Supabase indisponível." }

  const nome = String(formData.get("nome") ?? "").trim()
  const cor = corValida(String(formData.get("cor") ?? "")) ?? CORES_ETIQUETA[0]
  if (!nome) return { ok: false, erro: "Nome da etiqueta obrigatório." }

  const { data, error } = await db
    .from("crm_etiquetas")
    .insert({ usuario_id: usuario.id, nome, cor })
    .select("id")
    .single()
  if (error) {
    const jaExiste = error.code === "23505"
    return {
      ok: false,
      erro: jaExiste ? `Você já tem uma etiqueta "${nome}".` : error.message,
    }
  }

  revalidarCrm()
  return { ok: true, id: data?.id as string }
}

export async function editarEtiquetaAction(
  formData: FormData
): Promise<ResultadoEtiqueta> {
  const usuario = await getUsuarioAtual()
  if (!usuario) return { ok: false, erro: "Sessão expirada." }
  const db = getSupabaseAdmin()
  if (!db) return { ok: false, erro: "Supabase indisponível." }

  const id = String(formData.get("id") ?? "").trim()
  const nome = String(formData.get("nome") ?? "").trim()
  const cor = corValida(String(formData.get("cor") ?? ""))
  if (!id) return { ok: false, erro: "ID inválido." }
  if (!nome) return { ok: false, erro: "Nome da etiqueta obrigatório." }

  const patch: Record<string, unknown> = { nome }
  if (cor) patch.cor = cor

  const { error } = await db
    .from("crm_etiquetas")
    .update(patch)
    .eq("id", id)
    .eq("usuario_id", usuario.id)
  if (error) return { ok: false, erro: error.message }

  revalidarCrm()
  return { ok: true }
}

export async function excluirEtiquetaAction(
  formData: FormData
): Promise<ResultadoEtiqueta> {
  const usuario = await getUsuarioAtual()
  if (!usuario) return { ok: false, erro: "Sessão expirada." }
  const db = getSupabaseAdmin()
  if (!db) return { ok: false, erro: "Supabase indisponível." }

  const id = String(formData.get("id") ?? "").trim()
  if (!id) return { ok: false, erro: "ID inválido." }

  // crm_lead_etiquetas tem ON DELETE CASCADE — apagar a etiqueta já remove
  // as atribuições nos leads automaticamente.
  const { error } = await db
    .from("crm_etiquetas")
    .delete()
    .eq("id", id)
    .eq("usuario_id", usuario.id)
  if (error) return { ok: false, erro: error.message }

  revalidarCrm()
  return { ok: true }
}

export async function atribuirEtiquetaAction(
  formData: FormData
): Promise<ResultadoEtiqueta> {
  const usuario = await getUsuarioAtual()
  if (!usuario) return { ok: false, erro: "Sessão expirada." }
  const db = getSupabaseAdmin()
  if (!db) return { ok: false, erro: "Supabase indisponível." }

  const leadId = String(formData.get("lead_id") ?? "").trim()
  const etiquetaId = String(formData.get("etiqueta_id") ?? "").trim()
  if (!leadId || !etiquetaId) return { ok: false, erro: "Parâmetros inválidos." }

  // Confere posse dos dois lados antes de ligar (defesa em profundidade —
  // um lead só pode ganhar etiquetas do MESMO dono).
  const [{ data: lead }, { data: etiqueta }] = await Promise.all([
    db.from("crm_leads").select("id").eq("id", leadId).eq("usuario_id", usuario.id).maybeSingle(),
    db.from("crm_etiquetas").select("id").eq("id", etiquetaId).eq("usuario_id", usuario.id).maybeSingle(),
  ])
  if (!lead || !etiqueta) return { ok: false, erro: "Lead ou etiqueta não encontrado." }

  const { error } = await db
    .from("crm_lead_etiquetas")
    .upsert({ lead_id: leadId, etiqueta_id: etiquetaId }, { onConflict: "lead_id,etiqueta_id" })
  if (error) return { ok: false, erro: error.message }

  revalidarCrm()
  return { ok: true }
}

export async function removerEtiquetaAction(
  formData: FormData
): Promise<ResultadoEtiqueta> {
  const usuario = await getUsuarioAtual()
  if (!usuario) return { ok: false, erro: "Sessão expirada." }
  const db = getSupabaseAdmin()
  if (!db) return { ok: false, erro: "Supabase indisponível." }

  const leadId = String(formData.get("lead_id") ?? "").trim()
  const etiquetaId = String(formData.get("etiqueta_id") ?? "").trim()
  if (!leadId || !etiquetaId) return { ok: false, erro: "Parâmetros inválidos." }

  const { data: lead } = await db
    .from("crm_leads")
    .select("id")
    .eq("id", leadId)
    .eq("usuario_id", usuario.id)
    .maybeSingle()
  if (!lead) return { ok: false, erro: "Lead não encontrado." }

  const { error } = await db
    .from("crm_lead_etiquetas")
    .delete()
    .eq("lead_id", leadId)
    .eq("etiqueta_id", etiquetaId)
  if (error) return { ok: false, erro: error.message }

  revalidarCrm()
  return { ok: true }
}
