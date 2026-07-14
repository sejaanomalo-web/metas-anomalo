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
import { normalizarTelefone } from "./crm-telefone"

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
  ultimo_pairing_code: string | null
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
  if (r.ok && r.qrBase64) {
    await db
      .from("crm_instancias")
      .update({
        ultimo_qr: r.qrBase64,
        ultimo_pairing_code: null,
        status_conexao: "qrcode",
        updated_at: new Date().toISOString(),
      })
      .eq("instance_name", instanceName)
  }
  revalidarConexoes()
  if (!r.ok) {
    return {
      ok: true,
      erro: `Instância salva, mas a Evolution falhou (${r.erro}). Use "Gerar QR" para tentar de novo.`,
    }
  }
  return { ok: true }
}

export interface ResultadoQr extends ResultadoInstancia {
  qrBase64?: string
  pairingCode?: string
}

/**
 * Pede à Evolution pra (re)gerar o QR. A resposta do próprio connect já
 * costuma trazer o QR — persiste direto aqui e devolve pro client mostrar na
 * hora, sem depender só do webhook QRCODE_UPDATED (que pode atrasar ou nunca
 * chegar se o webhook da VPS estiver mal configurado). O webhook segue
 * valendo como atualização em segundo plano (ex: QR expira e a Evolution
 * manda um novo sozinha).
 */
export async function gerarQrAction(formData: FormData): Promise<ResultadoQr> {
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
  if (!r.ok) {
    revalidarConexoes()
    return { ok: false, erro: r.erro }
  }

  if (r.qrBase64) {
    await db
      .from("crm_instancias")
      .update({
        ultimo_qr: r.qrBase64,
        ultimo_pairing_code: null,
        status_conexao: "qrcode",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
  }
  revalidarConexoes()

  if (!r.qrBase64) {
    return {
      ok: true,
      erro:
        "A Evolution aceitou o pedido mas não devolveu o QR na hora — aguardando o webhook confirmar (alguns segundos). Se não aparecer, tente Recarregar/Reiniciar.",
    }
  }
  return { ok: true, qrBase64: r.qrBase64 }
}

/**
 * Segunda opção de login: código de pareamento — a Evolution troca o QR por
 * um código curto que o usuário digita no próprio WhatsApp (Aparelhos
 * conectados → Conectar com número de telefone → Digitar código), sem
 * precisar escanear nada. Existe pra quando o QR não aparece de jeito
 * nenhum (câmera com problema, escaneamento falhando etc) — o usuário nunca
 * fica na mão.
 */
export async function gerarCodigoPareamentoAction(
  formData: FormData
): Promise<ResultadoQr> {
  const usuario = await getUsuarioAtual()
  if (!usuario) return { ok: false, erro: "Sessão expirada." }
  const db = getSupabaseAdmin()
  if (!db) return { ok: false, erro: "Supabase indisponível." }

  const id = String(formData.get("id") ?? "").trim()
  const numero = normalizarTelefone(String(formData.get("numero") ?? ""))
  if (!id) return { ok: false, erro: "ID inválido." }
  if (!numero) return { ok: false, erro: "Número inválido (informe com DDD)." }

  const { data: inst } = await db
    .from("crm_instancias")
    .select("instance_name")
    .eq("id", id)
    .eq("usuario_id", usuario.id)
    .maybeSingle()
  if (!inst) return { ok: false, erro: "Instância não encontrada." }

  const r = await conectarInstanciaEvolution(inst.instance_name as string, numero)
  if (!r.ok) {
    revalidarConexoes()
    return { ok: false, erro: r.erro }
  }
  if (!r.pairingCode) {
    revalidarConexoes()
    return {
      ok: false,
      erro: "A Evolution não devolveu um código de pareamento — confira o número e tente de novo.",
    }
  }

  await db
    .from("crm_instancias")
    .update({
      ultimo_pairing_code: r.pairingCode,
      ultimo_qr: null,
      status_conexao: "qrcode",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
  revalidarConexoes()

  return { ok: true, pairingCode: r.pairingCode }
}

/**
 * "Recarregar/Reiniciar conexão" — pra quando a instância fica travada
 * esperando QR e nada resolve (sessão Baileys emperrada do lado da
 * Evolution). Desloga + apaga a sessão na Evolution (best-effort, igual
 * excluirInstanciaAction) e recria do zero, já puxando um QR novo — o
 * usuário não precisa ficar excluindo/recriando a instância manualmente.
 */
export async function reiniciarInstanciaAction(
  formData: FormData
): Promise<ResultadoQr> {
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
  const instanceName = inst.instance_name as string

  await db
    .from("crm_instancias")
    .update({
      ultimo_qr: null,
      ultimo_pairing_code: null,
      status_conexao: "desconhecido",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
  revalidarConexoes()

  // Best-effort: se a sessão já não existir do lado da Evolution (nunca
  // chegou a conectar, por exemplo), ignora e segue pro recreate mesmo assim.
  await excluirInstanciaEvolution(instanceName)

  const criado = await criarInstanciaEvolution(instanceName)
  if (!criado.ok) {
    revalidarConexoes()
    return { ok: false, erro: `Falha ao recriar na Evolution: ${criado.erro}` }
  }

  let qrBase64 = criado.qrBase64
  if (!qrBase64) {
    const conectado = await conectarInstanciaEvolution(instanceName)
    if (conectado.ok) qrBase64 = conectado.qrBase64
  }

  if (qrBase64) {
    await db
      .from("crm_instancias")
      .update({
        ultimo_qr: qrBase64,
        status_conexao: "qrcode",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
  }
  revalidarConexoes()

  if (!qrBase64) {
    return {
      ok: true,
      erro:
        "Instância reiniciada, mas o QR ainda não veio — aguarde o webhook ou clique em Gerar QR de novo em alguns segundos.",
    }
  }
  return { ok: true, qrBase64 }
}

export interface StatusInstancia {
  status_conexao: CrmInstanciaRow["status_conexao"]
  ultimo_qr: string | null
  ultimo_pairing_code: string | null
}

/** Leitura leve pro polling do client enquanto aguarda o usuário escanear o
 *  QR/digitar o código — evita esperar só pelo Realtime (que pode estar
 *  desligado silenciosamente, ver components/crm/CrmRealtime.tsx) ou por um
 *  router.refresh() manual. */
export async function buscarStatusInstanciaAction(
  id: string
): Promise<StatusInstancia | null> {
  const usuario = await getUsuarioAtual()
  if (!usuario) return null
  const db = getSupabaseAdmin()
  if (!db) return null

  const { data } = await db
    .from("crm_instancias")
    .select("status_conexao, ultimo_qr, ultimo_pairing_code")
    .eq("id", id)
    .eq("usuario_id", usuario.id)
    .maybeSingle()
  if (!data) return null
  return data as StatusInstancia
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
