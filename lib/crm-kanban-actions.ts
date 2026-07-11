"use server"

import { revalidatePath } from "next/cache"
import { getSupabaseAdmin } from "./supabase"
import { getUsuarioAtual } from "./auth"

export interface ResultadoMoverLead {
  ok: boolean
  erro?: string
}

/**
 * Move um lead pra outra etapa/posição do Kanban. `nova_ordem` já vem
 * calculada pelo client (ponto médio entre os vizinhos no drop — ver
 * components/crm/Kanban.tsx) pra não renumerar a coluna inteira a cada
 * arrasto, conforme o desenho original de `ordem_na_etapa`.
 *
 * Etapas terminais (tipo 'ganho'/'perdido') também fecham o status do lead
 * automaticamente — evita um lead "aberto" preso numa coluna de fechamento.
 */
export async function moverLeadAction(
  formData: FormData
): Promise<ResultadoMoverLead> {
  const usuario = await getUsuarioAtual()
  if (!usuario) return { ok: false, erro: "Sessão expirada." }
  const db = getSupabaseAdmin()
  if (!db) return { ok: false, erro: "Supabase indisponível." }

  const leadId = String(formData.get("lead_id") ?? "").trim()
  const etapaId = String(formData.get("etapa_id") ?? "").trim()
  const novaOrdem = Number(formData.get("nova_ordem") ?? "")
  if (!leadId || !etapaId || !Number.isFinite(novaOrdem)) {
    return { ok: false, erro: "Parâmetros inválidos." }
  }

  const { data: etapa } = await db
    .from("crm_etapas")
    .select("id, tipo, usuario_id")
    .eq("id", etapaId)
    .maybeSingle()
  if (!etapa) return { ok: false, erro: "Etapa não encontrada." }
  // Etapa custom de OUTRO usuário: não deixa mover pra lá (etapas padrão têm
  // usuario_id null e continuam abertas a todos).
  if (etapa.usuario_id && etapa.usuario_id !== usuario.id) {
    return { ok: false, erro: "Etapa não pertence a você." }
  }

  const patch: Record<string, unknown> = {
    etapa_id: etapaId,
    ordem_na_etapa: novaOrdem,
    updated_at: new Date().toISOString(),
  }
  if (etapa.tipo === "ganho") patch.status = "ganho"
  else if (etapa.tipo === "perdido") patch.status = "perdido"
  else patch.status = "aberto"

  const { error } = await db
    .from("crm_leads")
    .update(patch)
    .eq("id", leadId)
    .eq("usuario_id", usuario.id)
  if (error) return { ok: false, erro: error.message }

  revalidatePath("/dashboard/crm")
  return { ok: true }
}

export interface ResultadoEtapa {
  ok: boolean
  erro?: string
  id?: string
}

function corValida(bruto: string | null): string | null {
  if (!bruto) return null
  return /^#[0-9a-fA-F]{6}$/.test(bruto) ? bruto : null
}

/** Cria uma etapa CUSTOM do usuário logado (coluna nova no Kanban, visível só
 *  pra ele) — vai pro fim da ordem atual. */
export async function criarEtapaAction(
  formData: FormData
): Promise<ResultadoEtapa> {
  const usuario = await getUsuarioAtual()
  if (!usuario) return { ok: false, erro: "Sessão expirada." }
  const db = getSupabaseAdmin()
  if (!db) return { ok: false, erro: "Supabase indisponível." }

  const nome = String(formData.get("nome") ?? "").trim().slice(0, 60)
  const cor = corValida(String(formData.get("cor") ?? "")) ?? "#C9953A"
  if (!nome) return { ok: false, erro: "Nome da etapa obrigatório." }

  const { data: ultima } = await db
    .from("crm_etapas")
    .select("ordem")
    .eq("ativo", true)
    .order("ordem", { ascending: false })
    .limit(1)
    .maybeSingle()
  const proximaOrdem = ((ultima?.ordem as number) ?? 0) + 1

  const { data, error } = await db
    .from("crm_etapas")
    .insert({
      nome,
      cor,
      ordem: proximaOrdem,
      tipo: "aberta",
      ativo: true,
      usuario_id: usuario.id,
    })
    .select("id")
    .single()
  if (error) return { ok: false, erro: error.message }

  revalidatePath("/dashboard/crm")
  return { ok: true, id: data?.id as string }
}

/** Remove uma etapa CUSTOM do próprio usuário (não mexe nas 7 padrão — essas
 *  não têm dono, ninguém apaga pela UI). Leads que estavam nela voltam pra
 *  "sem etapa" (etapa_id null) em vez de sumir. */
export async function excluirEtapaAction(
  formData: FormData
): Promise<ResultadoEtapa> {
  const usuario = await getUsuarioAtual()
  if (!usuario) return { ok: false, erro: "Sessão expirada." }
  const db = getSupabaseAdmin()
  if (!db) return { ok: false, erro: "Supabase indisponível." }

  const id = String(formData.get("id") ?? "").trim()
  if (!id) return { ok: false, erro: "ID inválido." }

  const { data: etapa } = await db
    .from("crm_etapas")
    .select("id, usuario_id")
    .eq("id", id)
    .maybeSingle()
  if (!etapa) return { ok: false, erro: "Etapa não encontrada." }
  if (etapa.usuario_id !== usuario.id) {
    return { ok: false, erro: "Só é possível excluir etapas criadas por você." }
  }

  await db
    .from("crm_leads")
    .update({ etapa_id: null })
    .eq("etapa_id", id)
    .eq("usuario_id", usuario.id)

  const { error } = await db.from("crm_etapas").delete().eq("id", id)
  if (error) return { ok: false, erro: error.message }

  revalidatePath("/dashboard/crm")
  return { ok: true }
}
