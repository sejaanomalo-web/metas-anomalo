// =============================================================================
// CRM ↔ Comercial — sincronização automática do funil.
//
// Cada evento do funil de um lead do CRM vira UMA linha append-only em
// relatorios_comerciais (origem_registro='crm', origem 'organico'), somada
// pelas agregações existentes SEM alterá-las (funil, resumos, realizado
// orgânico do Metas). Roda em paralelo aos relatórios manuais — um não
// atrapalha o outro.
//
// Idempotente por (lead_id, evento): cada evento conta 1 ponto por lead. O
// índice único da migração 20260715 garante isso; o upsert com
// ignoreDuplicates só insere a primeira ocorrência (a data fica sendo a do
// primeiro disparo — o dia em que o lead alcançou aquela fase).
//
// Server-only (usa service_role via o `db` recebido). NÃO é um arquivo
// "use server" — exporta helpers síncronos (classificarEtapaComercial) além
// dos async, o que um módulo "use server" não permite.
// =============================================================================

import type { SupabaseClient } from "@supabase/supabase-js"

export type EventoComercial =
  | "mensagem"
  | "retorno"
  | "qualificado"
  | "reuniao_agendada"
  | "proposta"
  | "contrato"

// Colunas de relatorios_comerciais incrementadas por evento. Cada linha do CRM
// carrega exatamente 1 evento, então marca só a(s) coluna(s) dele com 1.
const COLUNAS_POR_EVENTO: Record<EventoComercial, Record<string, number>> = {
  mensagem: { mensagens: 1 },
  retorno: { retorno_mensagens: 1 },
  qualificado: { qualificados: 1 },
  reuniao_agendada: { reunioes_agendadas: 1 },
  // "Proposta enviada" no CRM = reunião realizada + proposta enviada no
  // comercial (fiz a reunião com o lead e mandei a proposta).
  proposta: { reunioes_realizadas: 1, propostas_enviadas: 1 },
  contrato: { contratos_fechados: 1 },
}

interface LeadComercial {
  id: string
  empresa_nome: string | null
  usuario_id: string | null
  usuario_nome: string | null
}

function semAcento(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
}

/**
 * Classifica a etapa do Kanban (pelo NOME + tipo) no evento do funil comercial
 * que ela representa — ou null quando a etapa não conta nada no comercial
 * (Novo contato, Follow-up, Proposta recusada, qualquer etapa perdida).
 *
 * Tolerante a acento/caixa e a variações de nome do funil do usuário (ele pode
 * renomear as etapas padrão). A ordem das checagens importa: "qualificada" e
 * "proposta" são testadas antes de "em conversa"/"reunião" porque os nomes se
 * sobrepõem (ex: "Em conversa qualificada" contém "em conversa").
 */
export function classificarEtapaComercial(
  nome: string,
  tipo: "aberta" | "ganho" | "perdido"
): EventoComercial | null {
  const n = semAcento(nome)
  // Fechamento de contrato: etapa de ganho, ou explicitamente "cliente".
  if (tipo === "ganho" || n === "cliente" || n.includes("contrato fechado")) {
    return "contrato"
  }
  // Etapas perdidas (inclui "proposta recusada") não pontuam.
  if (tipo === "perdido") return null
  if (n.includes("qualific")) return "qualificado"
  if (n.includes("proposta")) {
    if (n.includes("recus") || n.includes("perdid")) return null
    return "proposta"
  }
  if (
    n.includes("agendad") ||
    n.includes("agendamento") ||
    n.includes("reuni")
  ) {
    return "reuniao_agendada"
  }
  if (n.includes("em conversa")) return "mensagem"
  return null
}

/** Data de HOJE (YYYY-MM-DD) no fuso de Brasília — o comercial conta por dia
 *  local, não pelo UTC do servidor. */
function hojeBRT(): string {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Sao_Paulo",
  })
}

async function carregarLead(
  db: SupabaseClient,
  leadId: string
): Promise<LeadComercial | null> {
  const { data } = await db
    .from("crm_leads")
    .select("id, empresa_nome, usuario_id, usuario_nome")
    .eq("id", leadId)
    .maybeSingle()
  return (data as LeadComercial) ?? null
}

async function upsertEvento(
  db: SupabaseClient,
  lead: LeadComercial,
  evento: EventoComercial
): Promise<void> {
  if (!lead.empresa_nome) return // sem empresa não há a quem atribuir
  const payload: Record<string, unknown> = {
    empresa: lead.empresa_nome,
    colaborador_id: lead.usuario_id,
    colaborador_nome: lead.usuario_nome ?? "CRM",
    data: hojeBRT(),
    origem: "organico",
    origem_registro: "crm",
    lead_id: lead.id,
    evento,
    ...COLUNAS_POR_EVENTO[evento],
    updated_at: new Date().toISOString(),
  }
  const { error } = await db
    .from("relatorios_comerciais")
    .upsert(payload, { onConflict: "lead_id,evento", ignoreDuplicates: true })
  if (error) {
    console.error(
      "[crm-comercial-sync] upsert evento falhou",
      evento,
      error.message
    )
  }
}

/**
 * Registra no comercial o evento correspondente à etapa em que o lead acabou
 * de entrar (se ela pontua). No-op silencioso quando a etapa não mapeia num
 * evento. Chamada de dentro de aplicarFaseAoLead e moverLeadAction (Kanban) —
 * cobre TODOS os caminhos de mudança de fase.
 */
export async function registrarEventoDaEtapa(
  db: SupabaseClient,
  leadId: string,
  etapa: { nome: string; tipo: "aberta" | "ganho" | "perdido" }
): Promise<void> {
  const evento = classificarEtapaComercial(etapa.nome, etapa.tipo)
  if (!evento) return
  const lead = await carregarLead(db, leadId)
  if (!lead) return
  await upsertEvento(db, lead, evento)
}

/**
 * Registra "retorno" no comercial quando o cliente responde. Só conta se o
 * lead já recebeu ao menos uma mensagem NOSSA (direcao 'out') — a semântica é
 * "eu mandei, o cliente retornou". Idempotente (1 retorno por lead). Chamada do
 * webhook inbound a cada mensagem recebida (fromMe=false).
 */
export async function registrarRetornoComercial(
  db: SupabaseClient,
  leadId: string
): Promise<void> {
  const { data: temOut } = await db
    .from("crm_mensagens")
    .select("id")
    .eq("lead_id", leadId)
    .eq("direcao", "out")
    .limit(1)
    .maybeSingle()
  if (!temOut) return
  const lead = await carregarLead(db, leadId)
  if (!lead) return
  await upsertEvento(db, lead, "retorno")
}
