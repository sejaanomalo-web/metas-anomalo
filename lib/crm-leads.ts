// =============================================================================
// CRM — leitura de leads/mensagens pro inbox. Server-only (service_role),
// importado só por Server Components (app/dashboard/crm). Ações que
// escrevem (enviar mensagem, marcar como lido) ficam em
// lib/crm-mensagens-actions.ts.
// =============================================================================

import { getSupabaseAdmin } from "./supabase"

export interface CrmLeadRow {
  id: string
  empresa_slug: string
  empresa_nome: string
  telefone_e164: string | null
  nome: string | null
  email: string | null
  etapa_id: string | null
  responsavel_id: string | null
  responsavel_nome: string | null
  valor_estimado: number | null
  origem: string
  status: string
  ultima_interacao_em: string | null
  nao_lidas: number
  arquivado: boolean
  created_at: string
}

export interface CrmMensagemRow {
  id: string
  lead_id: string
  instancia_id: string | null
  empresa_slug: string
  direcao: "in" | "out"
  tipo: string
  conteudo: string | null
  midia_url: string | null
  wa_message_id: string | null
  status: string
  erro: string | null
  autor_id: string | null
  autor_nome: string | null
  from_me: boolean
  wa_timestamp: string | null
  created_at: string
}

/** Leads abertos, mais recentes primeiro. Sem filtro por usuário — "todos
 *  veem tudo" (mesma política de relatorios_comerciais). */
export async function listarLeadsInbox(): Promise<CrmLeadRow[]> {
  const db = getSupabaseAdmin()
  if (!db) return []
  const { data, error } = await db
    .from("crm_leads")
    .select("*")
    .eq("arquivado", false)
    .order("ultima_interacao_em", { ascending: false, nullsFirst: false })
    .limit(200)
  if (error) {
    console.error("[crm_leads] list error", error.message)
    return []
  }
  return (data ?? []) as CrmLeadRow[]
}

export async function buscarLead(leadId: string): Promise<CrmLeadRow | null> {
  const db = getSupabaseAdmin()
  if (!db) return null
  const { data, error } = await db
    .from("crm_leads")
    .select("*")
    .eq("id", leadId)
    .maybeSingle()
  if (error) {
    console.error("[crm_leads] get error", error.message)
    return null
  }
  return (data as CrmLeadRow) ?? null
}

export async function listarMensagensDoLead(
  leadId: string
): Promise<CrmMensagemRow[]> {
  const db = getSupabaseAdmin()
  if (!db) return []
  const { data, error } = await db
    .from("crm_mensagens")
    .select("*")
    .eq("lead_id", leadId)
    .order("wa_timestamp", { ascending: true })
  if (error) {
    console.error("[crm_mensagens] list error", error.message)
    return []
  }
  return (data ?? []) as CrmMensagemRow[]
}
