"use server"

import { revalidatePath } from "next/cache"
import { getSupabaseAdmin } from "./supabase"
import { enviarTextoEvolution } from "./evolution"
import { getUsuarioAtual } from "./auth"

export interface ResultadoEnvio {
  ok: boolean
  erro?: string
}

/**
 * Envia uma mensagem de texto pro lead: resolve a instância CONECTADA da
 * empresa do lead (1 número = 1 instância = 1 empresa), chama a Evolution,
 * e grava a mensagem em crm_mensagens mesmo se o envio falhar (status
 * 'falha' + erro, pra aparecer na thread).
 */
export async function enviarMensagemAction(
  leadId: string,
  texto: string
): Promise<ResultadoEnvio> {
  const textoLimpo = texto.trim()
  if (!textoLimpo) return { ok: false, erro: "Mensagem vazia." }

  const db = getSupabaseAdmin()
  if (!db) return { ok: false, erro: "Supabase indisponível." }

  const usuario = await getUsuarioAtual()
  if (!usuario) return { ok: false, erro: "Sessão expirada." }

  const { data: lead } = await db
    .from("crm_leads")
    .select("id, empresa_slug, telefone_e164, usuario_id")
    .eq("id", leadId)
    .eq("usuario_id", usuario.id)
    .maybeSingle()
  if (!lead) return { ok: false, erro: "Lead não encontrado." }
  if (!lead.telefone_e164) {
    return { ok: false, erro: "Lead sem telefone — não é possível enviar." }
  }

  const { data: inst } = await db
    .from("crm_instancias")
    .select("id, instance_name")
    .eq("empresa_slug", lead.empresa_slug)
    .eq("usuario_id", usuario.id)
    .eq("ativo", true)
    .eq("status_conexao", "conectado")
    .limit(1)
    .maybeSingle()
  if (!inst) {
    return { ok: false, erro: "Nenhuma instância conectada para esta empresa." }
  }

  const agora = new Date().toISOString()
  const envio = await enviarTextoEvolution(
    inst.instance_name as string,
    lead.telefone_e164 as string,
    textoLimpo
  )

  await db.from("crm_mensagens").insert({
    lead_id: leadId,
    instancia_id: inst.id,
    empresa_slug: lead.empresa_slug,
    usuario_id: lead.usuario_id,
    direcao: "out",
    tipo: "texto",
    conteudo: textoLimpo,
    wa_message_id: envio.messageId ?? null,
    status: envio.ok ? "enviada" : "falha",
    erro: envio.ok ? null : envio.erro ?? null,
    autor_id: usuario.id,
    autor_nome: usuario.nome,
    from_me: true,
    wa_timestamp: agora,
  })

  await db
    .from("crm_leads")
    .update({ ultima_interacao_em: agora, updated_at: agora })
    .eq("id", leadId)

  await db
    .from("crm_realtime_ping")
    .insert({ empresa_slug: lead.empresa_slug, lead_id: leadId, kind: "msg" })

  revalidatePath("/dashboard/crm")

  if (!envio.ok) return { ok: false, erro: `Falha ao enviar: ${envio.erro}` }
  return { ok: true }
}

export async function marcarLeadComoLidoAction(leadId: string): Promise<void> {
  const usuario = await getUsuarioAtual()
  if (!usuario) return
  const db = getSupabaseAdmin()
  if (!db) return
  await db
    .from("crm_leads")
    .update({ nao_lidas: 0 })
    .eq("id", leadId)
    .eq("usuario_id", usuario.id)
  revalidatePath("/dashboard/crm")
}
