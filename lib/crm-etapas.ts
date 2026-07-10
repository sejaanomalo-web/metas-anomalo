// Etapas do Kanban — vocabulário COMPARTILHADO (mesmas fases pra todo mundo;
// só os LEADS dentro delas são isolados por usuário). Server-only.

import { getSupabaseAdmin } from "./supabase"

export interface CrmEtapaRow {
  id: string
  nome: string
  ordem: number
  tipo: "aberta" | "ganho" | "perdido"
  cor: string | null
}

export async function listarEtapas(): Promise<CrmEtapaRow[]> {
  const db = getSupabaseAdmin()
  if (!db) return []
  const { data, error } = await db
    .from("crm_etapas")
    .select("id, nome, ordem, tipo, cor")
    .eq("ativo", true)
    .order("ordem", { ascending: true })
  if (error) {
    console.error("[crm_etapas] list error", error.message)
    return []
  }
  return (data ?? []) as CrmEtapaRow[]
}
