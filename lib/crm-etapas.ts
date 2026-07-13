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
import { registrarEventoDaEtapa } from "./crm-comercial-sync"

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

/**
 * Fase 8: espelho etapa -> etiqueta. Aplica no lead a etiqueta que espelha
 * `etapa` e remove qualquer OUTRA etiqueta-de-etapa que ele tivesse — elas
 * representam a fase ATUAL (mutuamente exclusivas), não um histórico
 * acumulado. Etiquetas sem etapa_id (nenhuma deveria existir pós-Fase 6, mas
 * por segurança) não são tocadas.
 */
export async function sincronizarEtiquetaComEtapa(
  db: SupabaseClient,
  usuarioId: string,
  leadId: string,
  etapa: { id: string; nome: string; cor: string | null }
): Promise<void> {
  const etiquetaId = await sincronizarEtiquetaDaEtapa(db, usuarioId, etapa)
  if (!etiquetaId) return

  const { data: etiquetasDeEtapa } = await db
    .from("crm_etiquetas")
    .select("id")
    .eq("usuario_id", usuarioId)
    .not("etapa_id", "is", null)
    .neq("id", etiquetaId)
  const idsParaRemover = (etiquetasDeEtapa ?? []).map((e) => e.id as string)
  if (idsParaRemover.length > 0) {
    await db
      .from("crm_lead_etiquetas")
      .delete()
      .eq("lead_id", leadId)
      .in("etiqueta_id", idsParaRemover)
  }

  const { error } = await db
    .from("crm_lead_etiquetas")
    .upsert({ lead_id: leadId, etiqueta_id: etiquetaId }, { onConflict: "lead_id,etiqueta_id" })
  if (error) {
    console.error("[crm_lead_etiquetas] sincronizarEtiquetaComEtapa falhou", error.message)
  }
}

/**
 * Move o lead pra `etapa` (fim da coluna) E sincroniza a etiqueta espelhada
 * — é o mesmo efeito de arrastar o card no Kanban. Usado sempre que a
 * mudança de fase é disparada de FORA do drag-and-drop (escolher etiqueta em
 * Conversas, agendar com categoria = nome de etapa, transições automáticas).
 */
export async function aplicarFaseAoLead(
  db: SupabaseClient,
  usuarioId: string,
  leadId: string,
  etapa: { id: string; nome: string; tipo: CrmEtapaRow["tipo"]; cor: string | null }
): Promise<void> {
  const { data: ultimoNaColuna } = await db
    .from("crm_leads")
    .select("ordem_na_etapa")
    .eq("etapa_id", etapa.id)
    .order("ordem_na_etapa", { ascending: false })
    .limit(1)
    .maybeSingle()
  const novaOrdem = ((ultimoNaColuna?.ordem_na_etapa as number) ?? 0) + 1000

  const patch: Record<string, unknown> = {
    etapa_id: etapa.id,
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
    .eq("usuario_id", usuarioId)
  if (error) {
    console.error("[crm_leads] aplicarFaseAoLead falhou", error.message)
    return
  }

  await sincronizarEtiquetaComEtapa(db, usuarioId, leadId, etapa)

  // Sincroniza o funil comercial (mensagem/qualificado/reunião/proposta/
  // contrato). No-op quando a etapa não pontua no comercial.
  await registrarEventoDaEtapa(db, leadId, { nome: etapa.nome, tipo: etapa.tipo })
}

function normalizarNomeEtapa(nome: string): string {
  return nome.trim().toLowerCase()
}

/**
 * Resolve as duas etapas usadas pelas ÚNICAS transições automáticas do
 * funil (criação de lead e primeira mensagem) pelo NOME, entre as etapas
 * visíveis ao usuário. Retorna null pra qualquer uma que não exista (ex: o
 * usuário renomeou/excluiu a etapa padrão) — a automação correspondente
 * simplesmente não dispara, sem quebrar o fluxo principal.
 */
export async function buscarEtapasAutomaticas(
  db: SupabaseClient,
  usuarioId: string
): Promise<{ novoContato: CrmEtapaRow | null; emConversa: CrmEtapaRow | null }> {
  const { data } = await db
    .from("crm_etapas")
    .select("id, nome, ordem, tipo, cor, usuario_id")
    .eq("ativo", true)
    .or(`usuario_id.is.null,usuario_id.eq.${usuarioId}`)
  const etapas = (data ?? []) as Record<string, any>[]
  const acha = (nomeAlvo: string): CrmEtapaRow | null => {
    const row = etapas.find((e) => normalizarNomeEtapa(e.nome as string) === nomeAlvo)
    if (!row) return null
    return {
      id: row.id as string,
      nome: row.nome as string,
      ordem: row.ordem as number,
      tipo: row.tipo as CrmEtapaRow["tipo"],
      cor: (row.cor as string) ?? null,
      propria: row.usuario_id === usuarioId,
    }
  }
  return { novoContato: acha("novo contato"), emConversa: acha("em conversa") }
}

/**
 * As duas ÚNICAS transições automáticas do funil (o resto avança manualmente
 * pela percepção do usuário com o lead): criação de lead -> "Novo Contato" é
 * feita no próprio insert (webhook/manual); esta função cobre a segunda —
 * primeira mensagem no chat -> "Em conversa". Chamada toda vez que uma
 * mensagem nova é gravada (inbound OU outbound); só age se o lead ainda
 * estiver exatamente em "Novo Contato" — se ele já foi movido (manualmente
 * ou por essa mesma automação numa mensagem anterior), não mexe mais.
 */
export async function avancarParaEmConversaSePrimeiraMsg(
  db: SupabaseClient,
  usuarioId: string,
  leadId: string
): Promise<void> {
  const { data: lead } = await db
    .from("crm_leads")
    .select("etapa_id")
    .eq("id", leadId)
    .maybeSingle()
  if (!lead) return

  const { novoContato, emConversa } = await buscarEtapasAutomaticas(db, usuarioId)
  if (!novoContato || !emConversa) return
  if (lead.etapa_id !== novoContato.id) return

  await aplicarFaseAoLead(db, usuarioId, leadId, emConversa)
}
