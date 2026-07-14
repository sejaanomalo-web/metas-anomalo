"use server"

import { revalidatePath } from "next/cache"
import { getSupabaseAdmin } from "./supabase"
import { enviarTextoEvolution, enviarAudioEvolution } from "./evolution"
import { uploadMidiaCrm } from "./crm-midia"
import { corrigirNumeroEnvio } from "./crm-telefone"
import { verificarLimiteEnvio } from "./crm-anti-ban"
import { getUsuarioAtual } from "./auth"
import {
  MENSAGENS_POR_PAGINA,
  type CrmMensagemRow,
  type PaginaMensagens,
} from "./crm-leads"
import { avancarParaEmConversaSePrimeiraMsg } from "./crm-etapas"

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

/**
 * Auto-cura o telefone do lead antes de enviar: leads manuais antigos podem
 * ter sido gravados com o número malformado (ex: "045991122829" — prefixo de
 * tronco "0" e sem o país "55"), o que a Evolution rejeita com "Bad Request".
 * corrigirNumeroEnvio só mexe no que é inequivocamente brasileiro-malformado
 * (começa com 0); número já em E.164, inclusive estrangeiro (+44…), passa
 * intocado. Quando corrige, persiste no lead pra não repetir todo envio (e
 * pra a UI mostrar o número certo). Best-effort na persistência: se colidir
 * com a UNIQUE(empresa_slug, telefone) — improvável — segue enviando com o
 * número corrigido sem gravar.
 */
async function resolverNumeroEnvio(
  db: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  leadId: string,
  telefoneBruto: string
): Promise<string> {
  const corrigido = corrigirNumeroEnvio(telefoneBruto)
  if (corrigido && corrigido !== telefoneBruto) {
    const { error } = await db
      .from("crm_leads")
      .update({ telefone_e164: corrigido, updated_at: new Date().toISOString() })
      .eq("id", leadId)
    if (error) {
      console.error("[crm_mensagens] falha ao auto-curar telefone do lead", error.message)
    }
  }
  return corrigido || telefoneBruto
}

/** Resolve a instancia CONECTADA da empresa do lead, do usuario logado.
 *  Retorna null com o motivo em `erro` quando nao ha uma. Traz conectado_em
 *  pra checagem anti-ban saber se o número está em aquecimento. */
async function resolverInstanciaConectada(
  db: ReturnType<typeof getSupabaseAdmin>,
  empresaSlug: string,
  usuarioId: string
): Promise<{ id: string; instance_name: string; conectado_em: string | null } | null> {
  if (!db) return null
  const { data } = await db
    .from("crm_instancias")
    .select("id, instance_name, conectado_em")
    .eq("empresa_slug", empresaSlug)
    .eq("usuario_id", usuarioId)
    .eq("ativo", true)
    .eq("status_conexao", "conectado")
    .limit(1)
    .maybeSingle()
  return data
    ? {
        id: data.id as string,
        instance_name: data.instance_name as string,
        conectado_em: (data.conectado_em as string) ?? null,
      }
    : null
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

  // Trava anti-bloqueio: barra o envio ANTES de chamar a Evolution se o padrão
  // (rajada, mesma mensagem em massa, etc.) arriscar um ban do WhatsApp. Não
  // grava mensagem nem chama a Evolution quando bloqueia — só devolve o motivo.
  const limite = await verificarLimiteEnvio(db, {
    instanciaId: inst.id,
    leadId,
    texto: textoLimpo,
    conectadoEm: inst.conectado_em,
  })
  if (!limite.ok) return { ok: false, erro: limite.erro }

  const numero = await resolverNumeroEnvio(db, leadId, lead.telefone_e164 as string)

  const agora = new Date().toISOString()
  const envio = await enviarTextoEvolution(inst.instance_name, numero, textoLimpo)

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

  // Fase 8: primeira mensagem no chat -> "Em conversa" (mesma automação do
  // lado inbound; no-op se o lead já saiu de "Novo Contato").
  await avancarParaEmConversaSePrimeiraMsg(db, usuario.id, leadId)

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

  // Trava anti-bloqueio (texto null: pula só a checagem de mensagem repetida;
  // os tetos de volume/rajada valem pra áudio também).
  const limite = await verificarLimiteEnvio(db, {
    instanciaId: inst.id,
    leadId,
    texto: null,
    conectadoEm: inst.conectado_em,
  })
  if (!limite.ok) return { ok: false, erro: limite.erro }

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

  const numero = await resolverNumeroEnvio(db, leadId, lead.telefone_e164 as string)

  const agora = new Date().toISOString()
  const envio = await enviarAudioEvolution(inst.instance_name, numero, audioBase64)

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

  await avancarParaEmConversaSePrimeiraMsg(db, usuario.id, leadId)

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
