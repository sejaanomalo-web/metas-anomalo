"use server"

import { revalidatePath } from "next/cache"
import { getSupabaseAdmin } from "./supabase"
import { getUsuarioAtual } from "./auth"
import {
  criarInstanciaEvolution,
  conectarInstanciaEvolution,
  excluirInstanciaEvolution,
} from "./evolution"
import { CORES_INSTANCIA } from "./crm-cores"

export interface CrmInstanciaRow {
  id: string
  instance_name: string
  empresa_slug: string
  usuario_id: string
  usuario_nome: string | null
  numero_e164: string | null
  display_nome: string | null
  cor: string
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
  revalidatePath("/dashboard/crm")
}

/** Instâncias do usuário logado (ativas e inativas) — isolamento total:
 *  cada usuário só vê as que ELE cadastrou, literal como WhatsApp Web. */
export async function listarInstancias(): Promise<CrmInstanciaRow[]> {
  const usuario = await getUsuarioAtual()
  if (!usuario) return []
  const db = getSupabaseAdmin()
  if (!db) return []
  const { data, error } = await db
    .from("crm_instancias")
    .select("*")
    .eq("usuario_id", usuario.id)
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

function corValida(bruto: string | null): string | null {
  if (!bruto) return null
  return /^#[0-9a-fA-F]{6}$/.test(bruto) ? bruto : null
}

/**
 * Cria a linha em crm_instancias (dona do usuário logado) e, em seguida, a
 * instância correspondente na Evolution API. Se a chamada à Evolution
 * falhar, a linha permanece criada (status 'desconhecido') — o botão
 * "Gerar QR" tenta de novo.
 */
export async function criarInstanciaAction(
  formData: FormData
): Promise<ResultadoInstancia> {
  const usuario = await getUsuarioAtual()
  if (!usuario) return { ok: false, erro: "Sessão expirada." }
  const db = getSupabaseAdmin()
  if (!db) return { ok: false, erro: "Supabase indisponível." }

  const empresaSlug = String(formData.get("empresa_slug") ?? "").trim()
  const instanceName = normalizarInstanceName(
    String(formData.get("instance_name") ?? "")
  )
  const numeroE164 =
    String(formData.get("numero_e164") ?? "").replace(/\D/g, "") || null
  const displayNome = String(formData.get("display_nome") ?? "").trim() || null
  const cor =
    corValida(String(formData.get("cor") ?? "")) ?? CORES_INSTANCIA[0]

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
    usuario_id: usuario.id,
    usuario_nome: usuario.nome,
    numero_e164: numeroE164,
    display_nome: displayNome,
    cor,
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
  const usuario = await getUsuarioAtual()
  if (!usuario) return { ok: false, erro: "Sessão expirada." }
  const db = getSupabaseAdmin()
  if (!db) return { ok: false, erro: "Supabase indisponível." }

  const id = String(formData.get("id") ?? "").trim()
  if (!id) return { ok: false, erro: "ID inválido." }

  const { data: inst } = await db
    .from("crm_instancias")
    .select("instance_name")
    .eq("id", id)
    .eq("usuario_id", usuario.id)
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
  const usuario = await getUsuarioAtual()
  if (!usuario) return { ok: false, erro: "Sessão expirada." }
  const db = getSupabaseAdmin()
  if (!db) return { ok: false, erro: "Supabase indisponível." }

  const id = String(formData.get("id") ?? "").trim()
  if (!id) return { ok: false, erro: "ID inválido." }

  const { error } = await db
    .from("crm_instancias")
    .update({ ativo: false, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("usuario_id", usuario.id)
  if (error) return { ok: false, erro: error.message }

  revalidarConexoes()
  return { ok: true }
}

export async function reativarInstanciaAction(
  formData: FormData
): Promise<ResultadoInstancia> {
  const usuario = await getUsuarioAtual()
  if (!usuario) return { ok: false, erro: "Sessão expirada." }
  const db = getSupabaseAdmin()
  if (!db) return { ok: false, erro: "Supabase indisponível." }

  const id = String(formData.get("id") ?? "").trim()
  if (!id) return { ok: false, erro: "ID inválido." }

  const { error } = await db
    .from("crm_instancias")
    .update({ ativo: true, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("usuario_id", usuario.id)
  if (error) return { ok: false, erro: error.message }

  revalidarConexoes()
  return { ok: true }
}

/**
 * Exclui a instância DE VEZ: apaga na Evolution (logout + delete) e remove a
 * linha em crm_instancias. As mensagens ficam preservadas
 * (crm_mensagens.instancia_id é ON DELETE SET NULL); os contatos cacheados
 * dessa instância somem (ON DELETE CASCADE). Diferente de "Desativar", que só
 * esconde e para de receber — este é irreversível (precisa reconectar o QR do
 * zero pra usar o número de novo). Só o dono pode excluir.
 */
export async function excluirInstanciaAction(
  formData: FormData
): Promise<ResultadoInstancia> {
  const usuario = await getUsuarioAtual()
  if (!usuario) return { ok: false, erro: "Sessão expirada." }
  const db = getSupabaseAdmin()
  if (!db) return { ok: false, erro: "Supabase indisponível." }

  const id = String(formData.get("id") ?? "").trim()
  if (!id) return { ok: false, erro: "ID inválido." }

  const { data: inst } = await db
    .from("crm_instancias")
    .select("instance_name")
    .eq("id", id)
    .eq("usuario_id", usuario.id)
    .maybeSingle()
  if (!inst) return { ok: false, erro: "Instância não encontrada." }

  // Best-effort na Evolution: se falhar (VPS fora, já não existe lá), ainda
  // removemos a linha local pra não deixar órfã — o número no VPS pode ser
  // limpo à parte.
  await excluirInstanciaEvolution(inst.instance_name as string)

  const { error } = await db
    .from("crm_instancias")
    .delete()
    .eq("id", id)
    .eq("usuario_id", usuario.id)
  if (error) return { ok: false, erro: error.message }

  revalidarConexoes()
  return { ok: true }
}

/** Muda só a cor de identificação visual de uma instância já criada. */
export async function atualizarCorInstanciaAction(
  formData: FormData
): Promise<ResultadoInstancia> {
  const usuario = await getUsuarioAtual()
  if (!usuario) return { ok: false, erro: "Sessão expirada." }
  const db = getSupabaseAdmin()
  if (!db) return { ok: false, erro: "Supabase indisponível." }

  const id = String(formData.get("id") ?? "").trim()
  const cor = corValida(String(formData.get("cor") ?? ""))
  if (!id) return { ok: false, erro: "ID inválido." }
  if (!cor) return { ok: false, erro: "Cor inválida." }

  const { error } = await db
    .from("crm_instancias")
    .update({ cor, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("usuario_id", usuario.id)
  if (error) return { ok: false, erro: error.message }

  revalidarConexoes()
  return { ok: true }
}
