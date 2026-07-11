"use server"

import { revalidatePath } from "next/cache"
import { getSupabaseAdmin } from "./supabase"
import { getUsuarioAtual } from "./auth"
import type { CrmEtiquetaResumo } from "./crm-leads"
import { sincronizarEtiquetaDaEtapa } from "./crm-etapas"

export interface ResultadoEtiqueta {
  ok: boolean
  erro?: string
}

function revalidarCrm() {
  revalidatePath("/dashboard/crm")
}

/**
 * Etiquetas do usuário logado — Fase 6: deixaram de ser um vocabulário livre
 * (criado em Conversas) e viraram um ESPELHO das etapas do Kanban visíveis a
 * ele (padrão + próprias), pra funcionar como as mesmas "fases". Criação/
 * edição/exclusão só acontece via etapa (Kanban); aqui só garantimos (self-
 * healing) que toda etapa visível tem uma etiqueta correspondente — cobre
 * também usuários novos, sem depender de backfill em migração.
 */
export async function listarEtiquetas(): Promise<CrmEtiquetaResumo[]> {
  const usuario = await getUsuarioAtual()
  if (!usuario) return []
  const db = getSupabaseAdmin()
  if (!db) return []

  const { data: etapas } = await db
    .from("crm_etapas")
    .select("id, nome, cor")
    .eq("ativo", true)
    .or(`usuario_id.is.null,usuario_id.eq.${usuario.id}`)
  if (!etapas || etapas.length === 0) return []

  const { data: existentes, error } = await db
    .from("crm_etiquetas")
    .select("id, nome, cor, etapa_id")
    .eq("usuario_id", usuario.id)
  if (error) {
    console.error("[crm_etiquetas] list error", error.message)
    return []
  }

  const idsEtapasComEtiqueta = new Set((existentes ?? []).map((e) => e.etapa_id))
  const faltando = etapas.filter((et) => !idsEtapasComEtiqueta.has(et.id))

  if (faltando.length === 0) {
    return (existentes ?? [])
      .filter((e) => e.etapa_id)
      .map((e) => ({ id: e.id as string, nome: e.nome as string, cor: e.cor as string }))
  }

  // Em paralelo (não sequencial) — cada etapa faltante é independente, e
  // isso importa principalmente no primeiro carregamento de um usuário novo
  // (várias etapas padrão pra sincronizar de uma vez só).
  await Promise.all(faltando.map((etapa) => sincronizarEtiquetaDaEtapa(db, usuario.id, etapa)))

  const { data: final } = await db
    .from("crm_etiquetas")
    .select("id, nome, cor")
    .eq("usuario_id", usuario.id)
    .not("etapa_id", "is", null)
  return (final ?? []) as CrmEtiquetaResumo[]
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
