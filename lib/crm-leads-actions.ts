"use server"

import { revalidatePath } from "next/cache"
import { getSupabaseAdmin } from "./supabase"
import { getUsuarioAtual } from "./auth"
import { buscarPerfilContatoEvolution } from "./evolution"

export interface ResultadoLead {
  ok: boolean
  erro?: string
}

/**
 * Define/edita o nome do lead à mão (ex: contato que chegou só como número).
 * Marca nome_manual=true pra o sync automático (CONTACTS_UPSERT/pushName) não
 * sobrescrever depois. Só o dono do lead pode renomear.
 */
export async function renomearLeadAction(
  leadId: string,
  nome: string
): Promise<ResultadoLead> {
  const usuario = await getUsuarioAtual()
  if (!usuario) return { ok: false, erro: "Sessão expirada." }
  const db = getSupabaseAdmin()
  if (!db) return { ok: false, erro: "Supabase indisponível." }

  const nomeLimpo = nome.trim().slice(0, 80)
  if (!nomeLimpo) return { ok: false, erro: "Nome vazio." }

  const { error } = await db
    .from("crm_leads")
    .update({
      nome: nomeLimpo,
      nome_manual: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", leadId)
    .eq("usuario_id", usuario.id)
  if (error) return { ok: false, erro: error.message }

  revalidatePath("/dashboard/crm")
  return { ok: true }
}

/**
 * Puxa nome/recado/foto do contato direto do WhatsApp (via Evolution
 * fetchProfile) e atualiza o lead. Respeita nome_manual: se o usuário já
 * nomeou à mão, o nome dele é mantido — só recado/foto são atualizados.
 */
export async function sincronizarContatoAction(
  leadId: string
): Promise<ResultadoLead> {
  const usuario = await getUsuarioAtual()
  if (!usuario) return { ok: false, erro: "Sessão expirada." }
  const db = getSupabaseAdmin()
  if (!db) return { ok: false, erro: "Supabase indisponível." }

  const { data: lead } = await db
    .from("crm_leads")
    .select("id, empresa_slug, telefone_e164, nome_manual")
    .eq("id", leadId)
    .eq("usuario_id", usuario.id)
    .maybeSingle()
  if (!lead) return { ok: false, erro: "Lead não encontrado." }
  if (!lead.telefone_e164) return { ok: false, erro: "Lead sem telefone." }

  const { data: inst } = await db
    .from("crm_instancias")
    .select("instance_name")
    .eq("empresa_slug", lead.empresa_slug)
    .eq("usuario_id", usuario.id)
    .eq("ativo", true)
    .eq("status_conexao", "conectado")
    .limit(1)
    .maybeSingle()
  if (!inst) {
    return { ok: false, erro: "Nenhuma instância conectada para buscar o contato." }
  }

  const perfil = await buscarPerfilContatoEvolution(
    inst.instance_name as string,
    lead.telefone_e164 as string
  )

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  // Só sobrescreve o nome se NÃO for manual (o nome digitado pelo usuário ganha).
  if (perfil.nome && !lead.nome_manual) patch.nome = perfil.nome
  if (perfil.sobre) patch.sobre = perfil.sobre
  if (perfil.foto) patch.foto_url = perfil.foto

  if (Object.keys(patch).length === 1) {
    return { ok: false, erro: "Nada novo encontrado para este contato." }
  }

  const { error } = await db
    .from("crm_leads")
    .update(patch)
    .eq("id", leadId)
    .eq("usuario_id", usuario.id)
  if (error) return { ok: false, erro: error.message }

  revalidatePath("/dashboard/crm")
  return { ok: true }
}
