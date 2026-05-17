"use server"

import { revalidatePath } from "next/cache"
import { getSupabase } from "./supabase"
import { getUsuarioIdSync } from "./auth"
import { getNotificacoesDaSessao, type NotificacaoItem } from "./notificacoes"

export async function marcarComoLidaAction(formData: FormData) {
  const usuarioId = getUsuarioIdSync()
  if (!usuarioId) return
  const id = String(formData.get("id") ?? "").trim()
  if (!id) return
  const supabase = getSupabase()
  if (!supabase) return
  const { error } = await supabase
    .from("notificacoes_usuario")
    .update({ lida_em: new Date().toISOString() })
    .eq("id", id)
    .eq("usuario_id", usuarioId) // defesa: só a própria linha
    .is("lida_em", null)
  if (error) {
    console.error("[notificacoes] marcar lida error", error.message)
  }
  revalidatePath("/dashboard", "layout")
}

export async function marcarTodasComoLidasAction() {
  const usuarioId = getUsuarioIdSync()
  if (!usuarioId) return
  const supabase = getSupabase()
  if (!supabase) return
  const { error } = await supabase
    .from("notificacoes_usuario")
    .update({ lida_em: new Date().toISOString() })
    .eq("usuario_id", usuarioId)
    .is("lida_em", null)
  if (error) {
    console.error("[notificacoes] marcar todas lidas error", error.message)
  }
  revalidatePath("/dashboard", "layout")
}

/**
 * Polling: cliente chama via useTransition/server-action a cada 30s pra
 * receber count + lista atual. Mais simples que Realtime e suficiente
 * pra MVP (custo: 1 query por usuário ativo a cada 30s).
 */
export async function getNotificacoesDaSessaoAction(): Promise<{
  count: number
  itens: NotificacaoItem[]
}> {
  return getNotificacoesDaSessao()
}
