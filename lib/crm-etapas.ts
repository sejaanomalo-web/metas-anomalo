// Etapas do Kanban — vocabulário COMPARTILHADO por padrão (as etapas
// padrão, mesmas pra todo mundo; só os LEADS dentro delas são isolados por
// usuário). Fase 5: cada usuário também pode criar as PRÓPRIAS etapas
// (usuario_id preenchido), visíveis só pra ele — mesmo espírito de
// crm_tipos_atividade (padrão global + custom por usuário). Server-only.
//
// Fase 6: etiquetas (crm_etiquetas) viram um ESPELHO das etapas — cada etapa
// visível ao usuário tem uma etiqueta correspondente (mesmo nome/cor),
// vinculada por etapa_id. sincronizarEtiquetaDaEtapa faz esse elo (get-or-
// create-or-relink); chamada tanto ao criar/editar etapa quanto ao ler a
// lista de etiquetas (lib/crm-etiquetas-actions.ts), o que também cobre
// usuários novos sem precisar de backfill.

import type { SupabaseClient } from "@supabase/supabase-js"
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

/**
 * Garante que existe uma etiqueta do usuário espelhando esta etapa —
 * cria se não existir, ou religa uma etiqueta já existente com o MESMO nome
 * (ex: uma tag manual "FOLLOW-UP" criada antes da Fase 6 passa a apontar pra
 * etapa "Follow-up" em vez de duplicar, respeitando a unicidade por
 * usuario_id+nome). Retorna o id da etiqueta, ou null se não foi possível.
 */
export async function sincronizarEtiquetaDaEtapa(
  db: SupabaseClient,
  usuarioId: string,
  etapa: { id: string; nome: string; cor: string | null }
): Promise<string | null> {
  const cor = etapa.cor ?? "#8e7cc3"
  const { data: minhas } = await db
    .from("crm_etiquetas")
    .select("id, nome, etapa_id")
    .eq("usuario_id", usuarioId)
  const existente = (minhas ?? []).find(
    (e: Record<string, any>) => (e.nome as string).toLowerCase() === etapa.nome.toLowerCase()
  )
  if (existente) {
    if (existente.etapa_id !== etapa.id) {
      await db
        .from("crm_etiquetas")
        .update({ etapa_id: etapa.id, cor })
        .eq("id", existente.id)
    }
    return existente.id as string
  }
  const { data: criada, error } = await db
    .from("crm_etiquetas")
    .insert({ usuario_id: usuarioId, nome: etapa.nome, cor, etapa_id: etapa.id })
    .select("id")
    .single()
  if (error) {
    console.error("[crm_etiquetas] sync error", error.message)
    return null
  }
  return (criada?.id as string) ?? null
}
