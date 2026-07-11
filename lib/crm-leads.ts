// =============================================================================
// CRM — leitura de leads/mensagens pro inbox. Server-only (service_role),
// importado só por Server Components (app/dashboard/crm). Ações que
// escrevem (enviar mensagem, marcar como lido) ficam em
// lib/crm-mensagens-actions.ts.
// =============================================================================
// Isolamento por usuário (Fase 2): cada função só lê o que pertence ao
// usuário da sessão atual — literal como WhatsApp Web, ninguém vê a conexão
// de outro sem ter conectado a própria.

import { getSupabaseAdmin } from "./supabase"
import { getUsuarioAtual } from "./auth"

export interface CrmEtiquetaResumo {
  id: string
  nome: string
  cor: string
}

export interface CrmLeadRow {
  id: string
  empresa_slug: string
  empresa_nome: string
  usuario_id: string
  usuario_nome: string | null
  telefone_e164: string | null
  nome: string | null
  nome_manual: boolean
  sobre: string | null
  email: string | null
  foto_url: string | null
  ultima_msg_preview: string | null
  etapa_id: string | null
  ordem_na_etapa: number
  responsavel_id: string | null
  responsavel_nome: string | null
  valor_estimado: number | null
  origem: string
  status: string
  ultima_interacao_em: string | null
  nao_lidas: number
  arquivado: boolean
  created_at: string
  etiquetas: CrmEtiquetaResumo[]
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

const SELECT_LEAD_COM_ETIQUETAS =
  "*, crm_lead_etiquetas(etiqueta:crm_etiquetas(id,nome,cor))"

function normalizarLead(row: Record<string, any>): CrmLeadRow {
  const rel = Array.isArray(row.crm_lead_etiquetas) ? row.crm_lead_etiquetas : []
  const etiquetas: CrmEtiquetaResumo[] = rel
    .map((r: any) => (Array.isArray(r.etiqueta) ? r.etiqueta[0] : r.etiqueta))
    .filter(Boolean)
    .map((e: any) => ({ id: e.id as string, nome: e.nome as string, cor: e.cor as string }))
  const { crm_lead_etiquetas: _omit, ...resto } = row
  return { ...(resto as CrmLeadRow), etiquetas }
}

/** Leads do usuário logado, mais recentes primeiro. `arquivados=true` mostra
 *  só os arquivados em vez dos ativos (ex: conversa apagada no celular —
 *  ver CHATS_DELETE em lib/crm-inbound.ts — some do inbox normal, mas fica
 *  recuperável em vez de vazar dado silenciosamente). */
export async function listarLeadsInbox(opts?: {
  arquivados?: boolean
}): Promise<CrmLeadRow[]> {
  const usuario = await getUsuarioAtual()
  if (!usuario) return []
  const db = getSupabaseAdmin()
  if (!db) return []
  const { data, error } = await db
    .from("crm_leads")
    .select(SELECT_LEAD_COM_ETIQUETAS)
    .eq("usuario_id", usuario.id)
    .eq("arquivado", Boolean(opts?.arquivados))
    .order("ultima_interacao_em", { ascending: false, nullsFirst: false })
    .limit(200)
  if (error) {
    console.error("[crm_leads] list error", error.message)
    return []
  }
  return (data ?? []).map(normalizarLead)
}

/** Quantidade de leads arquivados do usuário — pra mostrar/esconder o link
 *  "Ver arquivados" sem precisar buscar a lista inteira. */
export async function contarLeadsArquivados(): Promise<number> {
  const usuario = await getUsuarioAtual()
  if (!usuario) return 0
  const db = getSupabaseAdmin()
  if (!db) return 0
  const { count } = await db
    .from("crm_leads")
    .select("id", { count: "exact", head: true })
    .eq("usuario_id", usuario.id)
    .eq("arquivado", true)
  return count ?? 0
}

export async function buscarLead(leadId: string): Promise<CrmLeadRow | null> {
  const usuario = await getUsuarioAtual()
  if (!usuario) return null
  const db = getSupabaseAdmin()
  if (!db) return null
  const { data, error } = await db
    .from("crm_leads")
    .select(SELECT_LEAD_COM_ETIQUETAS)
    .eq("id", leadId)
    .eq("usuario_id", usuario.id)
    .maybeSingle()
  if (error) {
    console.error("[crm_leads] get error", error.message)
    return null
  }
  return data ? normalizarLead(data) : null
}

export interface PaginaMensagens {
  mensagens: CrmMensagemRow[]
  /** true = pode haver mensagens mais antigas ainda não carregadas. */
  temMaisAntigas: boolean
}

// Tamanho da página de mensagens — igual ao WhatsApp Web, a thread abre só
// com as mais recentes; o resto vem sob demanda ("Carregar anteriores").
// Sem isso, uma conversa com milhares de mensagens carregava tudo de uma vez
// e travava a página inteira ao abrir.
export const MENSAGENS_POR_PAGINA = 60

/** Mensagens mais RECENTES do lead (últimas MENSAGENS_POR_PAGINA), em ordem
 *  cronológica. Filtra por usuario_id direto (sem depender do chamador já ter
 *  verificado o dono do lead antes). */
export async function listarMensagensDoLead(
  leadId: string,
  limite = MENSAGENS_POR_PAGINA
): Promise<PaginaMensagens> {
  const usuario = await getUsuarioAtual()
  if (!usuario) return { mensagens: [], temMaisAntigas: false }
  const db = getSupabaseAdmin()
  if (!db) return { mensagens: [], temMaisAntigas: false }
  const { data, error } = await db
    .from("crm_mensagens")
    .select("*")
    .eq("lead_id", leadId)
    .eq("usuario_id", usuario.id)
    .order("wa_timestamp", { ascending: false, nullsFirst: false })
    .limit(limite)
  if (error) {
    console.error("[crm_mensagens] list error", error.message)
    return { mensagens: [], temMaisAntigas: false }
  }
  const linhas = ((data ?? []) as CrmMensagemRow[]).reverse()
  return { mensagens: linhas, temMaisAntigas: linhas.length === limite }
}
