"use server"

import { revalidatePath } from "next/cache"
import { getSupabaseAdmin } from "./supabase"
import { enviarTextoEvolution, enviarAudioEvolution } from "./evolution"
import { uploadMidiaCrm } from "./crm-midia"
import { getUsuarioAtual } from "./auth"
import {
  MENSAGENS_POR_PAGINA,
  type CrmMensagemRow,
  type PaginaMensagens,
} from "./crm-leads"

export interface ResultadoEnvio {
  ok: boolean
  erro?: string
}

/** Página de mensagens ANTERIORES a um cursor (wa_timestamp da mais antiga já
 *  carregada) — usada pelo botão "Carregar mensagens anteriores" da thread. */
export async function carregarMensagensAntigasAction(
  leadId: string,
  antesIso: string,
  limite = MENSAGENS_POR_PAGINA
): Promise<PaginaMensagens> {
  const usuario = await getUsuarioAtual()
  if (!usuario) return { mensagens: [], temMaisAntigas: false }
  const db = getSupabaseAdmin()
  if (!db) return { mensagens: [], temMaisAntigas: false }
  const { data, error } = await db
    .from("crm_mensagens")
    .select("*")
    .eq("lead_id", leadId)
    .eq("usuario_id", usuario.id)
    .lt("wa_timestamp", antesIso)
    .order("wa_timestamp", { ascending: false, nullsFirst: false })
    .limit(limite)
  if (error) {
    console.error("[crm_mensagens] carregar antigas error", error.message)
    return { mensagens: [], temMaisAntigas: false }
  }
  const linhas = ((data ?? []) as CrmMensagemRow[]).reverse()
  return { mensagens: linhas, temMaisAntigas: linhas.length === limite }
}

/** Resolve a instancia CONECTADA da empresa do lead, do usuario logado.
 *  Retorna null com o motivo em `erro` quando nao ha uma. */
async function resolverInstanciaConectada(
  db: ReturnType<typeof getSupabaseAdmin>,
  empresaSlug: string,
  usuarioId: string
): Promise<{ id: string; instance_name: string } | null> {
  if (!db) return null
  const { data } = await db
    .from("crm_instancias")
    .select("id, instance_name")
    .eq("empresa_slug", empresaSlug)
    .eq("usuario_id", usuarioId)
    .eq("ativo", true)
    .eq("status_conexao", "conectado")
    .limit(1)
    .maybeSingle()
  return data ? { id: data.id as string, instance_name: data.instance_name as string } : null
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

  const inst = await resolverInstanciaConectada(db, lead.empresa_slug, usuario.id)
  if (!inst) {
    return { ok: false, erro: "Nenhuma instância conectada para esta empresa." }
  }

  const agora = new Date().toISOString()
  const envio = await enviarTextoEvolution(
    inst.instance_name,
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
    .update({
      ultima_interacao_em: agora,
      ultima_msg_preview: textoLimpo.length > 90 ? `${textoLimpo.slice(0, 90)}…` : textoLimpo,
      updated_at: agora,
    })
    .eq("id", leadId)

  await db
    .from("crm_realtime_ping")
    .insert({ empresa_slug: lead.empresa_slug, lead_id: leadId, kind: "msg" })

  revalidatePath("/dashboard/crm")

  if (!envio.ok) return { ok: false, erro: `Falha ao enviar: ${envio.erro}` }
  return { ok: true }
}

// Limite defensivo do tamanho do audio (base64 ~= 1.33x do binario). ~8MB de
// base64 -> ~6MB de audio, folgado pra uma nota de voz de varios minutos.
const MAX_AUDIO_BASE64 = 8 * 1024 * 1024

/**
 * Envia uma nota de voz (audio) pro lead. Recebe o base64 gravado no
 * navegador (MediaRecorder), sobe pro storage (pra tocar de volta na thread)
 * e manda pra Evolution via /sendWhatsAppAudio. Grava a mensagem mesmo se o
 * envio falhar (status 'falha'), igual ao envio de texto.
 */
export async function enviarAudioAction(
  leadId: string,
  audioBase64: string,
  mimetype: string | null
): Promise<ResultadoEnvio> {
  if (!audioBase64) return { ok: false, erro: "Áudio vazio." }
  if (audioBase64.length > MAX_AUDIO_BASE64) {
    return { ok: false, erro: "Áudio muito longo (máx. ~6MB)." }
  }

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

  const inst = await resolverInstanciaConectada(db, lead.empresa_slug, usuario.id)
  if (!inst) {
    return { ok: false, erro: "Nenhuma instância conectada para esta empresa." }
  }

  // Sobe pro storage pra tocar de volta na thread. Se o storage falhar, só usa
  // o proprio data URL como fallback quando for PEQUENO (nota curta) — um
  // fallback grande direto na coluna midia_url deixaria a mensagem com vários
  // MB de string, travando a conversa inteira ao carregar a thread depois.
  // Acima do limite, a entrega no WhatsApp continua normal (abaixo); só a
  // reprodução dentro do app fica indisponível pra essa mensagem.
  const LIMITE_FALLBACK_INLINE = 300 * 1024
  const urlStorage = await uploadMidiaCrm(audioBase64, mimetype, `out/${usuario.id}`)
  const midiaUrl =
    urlStorage ?? (audioBase64.length <= LIMITE_FALLBACK_INLINE ? audioBase64 : null)

  const agora = new Date().toISOString()
  const envio = await enviarAudioEvolution(
    inst.instance_name,
    lead.telefone_e164 as string,
    audioBase64
  )

  await db.from("crm_mensagens").insert({
    lead_id: leadId,
    instancia_id: inst.id,
    empresa_slug: lead.empresa_slug,
    usuario_id: lead.usuario_id,
    direcao: "out",
    tipo: "audio",
    conteudo: null,
    midia_url: midiaUrl,
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
    .update({
      ultima_interacao_em: agora,
      ultima_msg_preview: "🎤 Áudio",
      updated_at: agora,
    })
    .eq("id", leadId)

  await db
    .from("crm_realtime_ping")
    .insert({ empresa_slug: lead.empresa_slug, lead_id: leadId, kind: "msg" })

  revalidatePath("/dashboard/crm")

  if (!envio.ok) return { ok: false, erro: `Falha ao enviar áudio: ${envio.erro}` }
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
