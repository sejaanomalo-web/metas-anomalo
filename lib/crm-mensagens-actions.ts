"use server"

import { revalidatePath } from "next/cache"
import { getSupabaseAdmin } from "./supabase"
import { getUsuarioAtual } from "./auth"

// =============================================================================
// CRM — Fase 8: o CRM não envia mais mensagem pela Evolution (envio/áudio era o
// principal vetor de banimento do número). Sobrou só o que zera o contador de
// "não lidas" ao abrir a ficha do lead. As mensagens recebidas continuam sendo
// gravadas pelo webhook (lib/crm-inbound.ts), mas só alimentam a lista
// (última interação / prévia / badge) — não há mais tela de conversa.
// =============================================================================

/** Zera o contador de não-lidas do lead (chamado ao abrir a ficha do contato,
 *  igual a abrir uma conversa no WhatsApp). */
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
