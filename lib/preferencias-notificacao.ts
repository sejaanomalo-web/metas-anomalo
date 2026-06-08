"use server"

import { revalidatePath } from "next/cache"
import { getSupabaseAdmin } from "./supabase"
import { getUsuarioIdSync } from "./auth"

export interface PreferenciasNotificacao {
  nova_venda: boolean
  lembrete: boolean
  dados_comercial: boolean
  dados_trafego: boolean
  meta_batida: boolean
  dados_sentinela: boolean
}

const TIPOS: (keyof PreferenciasNotificacao)[] = [
  "nova_venda",
  "lembrete",
  "dados_comercial",
  "dados_trafego",
  "meta_batida",
  "dados_sentinela",
]

const PADRAO: PreferenciasNotificacao = {
  nova_venda: true,
  lembrete: true,
  dados_comercial: true,
  dados_trafego: true,
  meta_batida: true,
  dados_sentinela: true,
}

/** Preferências do usuário. Ausência de linha = tudo ligado (PADRAO). */
export async function getPreferenciasNotificacao(
  usuarioId: string
): Promise<PreferenciasNotificacao> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return PADRAO
  const { data, error } = await supabase
    .from("preferencias_notificacao")
    .select("*")
    .eq("usuario_id", usuarioId)
    .maybeSingle()
  if (error || !data) return PADRAO
  const out = { ...PADRAO }
  for (const t of TIPOS) {
    const v = (data as Record<string, unknown>)[t]
    if (typeof v === "boolean") out[t] = v
  }
  return out
}

export async function atualizarPreferenciasNotificacaoAction(
  formData: FormData
): Promise<{ ok: boolean; erro?: string }> {
  const usuarioId = getUsuarioIdSync()
  if (!usuarioId) return { ok: false, erro: "Não autenticado." }
  const supabase = getSupabaseAdmin()
  if (!supabase) return { ok: false, erro: "Supabase indisponível." }

  const payload: Record<string, unknown> = {
    usuario_id: usuarioId,
    updated_at: new Date().toISOString(),
  }
  for (const t of TIPOS) payload[t] = formData.get(`pref_${t}`) === "on"

  const { error } = await supabase
    .from("preferencias_notificacao")
    .upsert(payload, { onConflict: "usuario_id" })
  if (error) {
    console.error("[preferencias] atualizar error", error.message)
    return { ok: false, erro: error.message }
  }

  revalidatePath("/dashboard/configuracoes")
  return { ok: true }
}
