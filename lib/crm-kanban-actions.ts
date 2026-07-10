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
    .select("id, tipo")
    .eq("id", etapaId)
    .maybeSingle()
  if (!etapa) return { ok: false, erro: "Etapa não encontrada." }

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
