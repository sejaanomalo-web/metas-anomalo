// Etapas do Kanban — vocabulário COMPARTILHADO por padrão (as 7 etapas
// padrão, mesmas pra todo mundo; só os LEADS dentro delas são isolados por
// usuário). Fase 5: cada usuário também pode criar as PRÓPRIAS etapas
// (usuario_id preenchido), visíveis só pra ele — mesmo espírito de
// crm_tipos_atividade (padrão global + custom por usuário). Server-only.

import { getSupabaseAdmin } from "./supabase"
import { getUsuarioAtual } from "./auth"

export interface CrmEtapaRow {
  id: string
  nome: string
  ordem: number
  tipo: "aberta" | "ganho" | "perdido"
  cor: string | null
  /** true = etapa custom do usuário logado; false = padrão compartilhada. */
  propria: boolean
}

/** Etapas visíveis ao usuário logado: as padrão (usuario_id null) + as
 *  próprias custom, na mesma ordem. */
export async function listarEtapas(): Promise<CrmEtapaRow[]> {
  const db = getSupabaseAdmin()
  if (!db) return []
  const usuario = await getUsuarioAtual()

  let query = db
    .from("crm_etapas")
    .select("id, nome, ordem, tipo, cor, usuario_id")
    .eq("ativo", true)
  query = usuario
    ? query.or(`usuario_id.is.null,usuario_id.eq.${usuario.id}`)
    : query.is("usuario_id", null)

  const { data, error } = await query.order("ordem", { ascending: true })
  if (error) {
    console.error("[crm_etapas] list error", error.message)
    return []
  }
  return (data ?? []).map((row: Record<string, any>) => ({
    id: row.id as string,
    nome: row.nome as string,
    ordem: row.ordem as number,
    tipo: row.tipo as CrmEtapaRow["tipo"],
    cor: (row.cor as string) ?? null,
    propria: row.usuario_id === usuario?.id,
  }))
}
