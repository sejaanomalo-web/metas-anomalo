"use server"

import { revalidatePath } from "next/cache"
import { getSupabaseAdmin } from "./supabase"
import { criarInstanciaEvolution, conectarInstanciaEvolution } from "./evolution"

export interface CrmInstanciaRow {
  id: string
  instance_name: string
  empresa_slug: string
  numero_e164: string | null
  display_nome: string | null
  status_conexao: "conectado" | "desconectado" | "qrcode" | "desconhecido"
  ultimo_qr: string | null
  conectado_em: string | null
  ativo: boolean
  created_at: string
  updated_at: string
}

export interface ResultadoInstancia {
  ok: boolean
  erro?: string
}

function revalidarConexoes() {
  revalidatePath("/dashboard/crm/conexoes")
}

/** Todas as instâncias (ativas e inativas) — a UI decide o que mostrar. */
export async function listarInstancias(): Promise<CrmInstanciaRow[]> {
  const db = getSupabaseAdmin()
  if (!db) return []
  const { data, error } = await db
    .from("crm_instancias")
    .select("*")
    .order("created_at", { ascending: false })
  if (error) {
    console.error("[crm_instancias] list error", error.message)
    return []
  }
  return (data ?? []) as CrmInstanciaRow[]
}

function normalizarInstanceName(bruto: string): string {
  return bruto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-|-$/g, "")
}

/**
 * Cria a linha em crm_instancias e, em seguida, a instância correspondente
 * na Evolution API. Se a chamada à Evolution falhar, a linha permanece
 * criada (status 'desconhecido') — o botão "Gerar QR" tenta de novo.
 */
export async function criarInstanciaAction(
  formData: FormData
): Promise<ResultadoInstancia> {
  const db = getSupabaseAdmin()
  if (!db) return { ok: false, erro: "Supabase indisponível." }

  const empresaSlug = String(formData.get("empresa_slug") ?? "").trim()
  const instanceName = normalizarInstanceName(
    String(formData.get("instance_name") ?? "")
  )
  const numeroE164 =
    String(formData.get("numero_e164") ?? "").replace(/\D/g, "") || null
  const displayNome = String(formData.get("display_nome") ?? "").trim() || null

  if (!empresaSlug) return { ok: false, erro: "Selecione a empresa." }
  if (!instanceName) return { ok: false, erro: "Nome da instância inválido." }

  const { data: existente } = await db
    .from("crm_instancias")
    .select("id")
    .eq("instance_name", instanceName)
    .maybeSingle()
  if (existente) {
    return { ok: false, erro: `Já existe uma instância "${instanceName}".` }
  }

  const { error } = await db.from("crm_instancias").insert({
    instance_name: instanceName,
    empresa_slug: empresaSlug,
    numero_e164: numeroE164,
    display_nome: displayNome,
    status_conexao: "desconhecido",
    ativo: true,
  })
  if (error) {
    console.error("[crm_instancias] insert error", error.message)
    return { ok: false, erro: error.message }
  }

  const r = await criarInstanciaEvolution(instanceName)
  revalidarConexoes()
  if (!r.ok) {
    return {
      ok: true,
      erro: `Instância salva, mas a Evolution falhou (${r.erro}). Use "Gerar QR" para tentar de novo.`,
    }
  }
  return { ok: true }
}

/** Pede à Evolution pra (re)gerar o QR. O QR em si chega pelo webhook
 *  (QRCODE_UPDATED) e fica em crm_instancias.ultimo_qr. */
export async function gerarQrAction(
  formData: FormData
): Promise<ResultadoInstancia> {
  const db = getSupabaseAdmin()
  if (!db) return { ok: false, erro: "Supabase indisponível." }

  const id = String(formData.get("id") ?? "").trim()
  if (!id) return { ok: false, erro: "ID inválido." }

  const { data: inst } = await db
    .from("crm_instancias")
    .select("instance_name")
    .eq("id", id)
    .maybeSingle()
  if (!inst) return { ok: false, erro: "Instância não encontrada." }

  const r = await conectarInstanciaEvolution(inst.instance_name as string)
  revalidarConexoes()
  if (!r.ok) return { ok: false, erro: r.erro }
  return { ok: true }
}

export async function desativarInstanciaAction(
  formData: FormData
): Promise<ResultadoInstancia> {
  const db = getSupabaseAdmin()
  if (!db) return { ok: false, erro: "Supabase indisponível." }

  const id = String(formData.get("id") ?? "").trim()
  if (!id) return { ok: false, erro: "ID inválido." }

  const { error } = await db
    .from("crm_instancias")
    .update({ ativo: false, updated_at: new Date().toISOString() })
    .eq("id", id)
  if (error) return { ok: false, erro: error.message }

  revalidarConexoes()
  return { ok: true }
}

export async function reativarInstanciaAction(
  formData: FormData
): Promise<ResultadoInstancia> {
  const db = getSupabaseAdmin()
  if (!db) return { ok: false, erro: "Supabase indisponível." }

  const id = String(formData.get("id") ?? "").trim()
  if (!id) return { ok: false, erro: "ID inválido." }

  const { error } = await db
    .from("crm_instancias")
    .update({ ativo: true, updated_at: new Date().toISOString() })
    .eq("id", id)
  if (error) return { ok: false, erro: error.message }

  revalidarConexoes()
  return { ok: true }
}
