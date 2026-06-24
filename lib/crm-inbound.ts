// =============================================================================
// CRM — processamento de webhooks da Evolution (INBOUND). Server-only (usa
// service_role; importado pelo route handler do webhook, nunca pelo client).
// =============================================================================
// Fase 0: so trata messages.upsert — cria/mergeia o lead, grava a mensagem
// recebida (idempotente por instancia_id+wa_message_id) e emite o ping de
// realtime. Status de entrega, conexao/QR e outbound entram nas proximas
// fases. NUNCA lanca excecao fatal pro webhook: retorna { ok, info?, erro? }.

import { getSupabaseAdmin } from "./supabase"

interface ResultadoProcessamento {
  ok: boolean
  info?: string
  erro?: string
}

/** Telefone E.164 (so digitos) a partir do remoteJid. null se for grupo
 *  (@g.us) ou formato inesperado. */
function telefoneDoJid(jid: unknown): string | null {
  if (typeof jid !== "string") return null
  if (jid.includes("@g.us")) return null // grupo — fora do MVP
  const arroba = jid.indexOf("@")
  const cru = arroba >= 0 ? jid.slice(0, arroba) : jid
  const digitos = cru.replace(/\D/g, "")
  return digitos.length >= 8 ? digitos : null
}

function mapearTipo(messageType: unknown): string {
  switch (messageType) {
    case "imageMessage":
      return "imagem"
    case "audioMessage":
      return "audio"
    case "videoMessage":
      return "video"
    case "documentMessage":
      return "documento"
    case "stickerMessage":
      return "figurinha"
    case "locationMessage":
      return "localizacao"
    case "contactMessage":
    case "contactsArrayMessage":
      return "contato"
    default:
      return "texto"
  }
}

function extrairTexto(message: unknown): string | null {
  if (!message || typeof message !== "object") return null
  const m = message as Record<string, any>
  return (
    m.conversation ??
    m.extendedTextMessage?.text ??
    m.imageMessage?.caption ??
    m.videoMessage?.caption ??
    m.documentMessage?.caption ??
    null
  )
}

/** messageTimestamp (segundos unix, pode vir string) -> ISO. */
function tsParaIso(ts: unknown): string | null {
  const n = typeof ts === "string" ? parseInt(ts, 10) : (ts as number)
  if (!n || Number.isNaN(n)) return null
  return new Date(n * 1000).toISOString()
}

export async function processarEventoWebhook(
  payload: any
): Promise<ResultadoProcessamento> {
  const evento: string = payload?.event ?? ""
  const instanceName: string | undefined = payload?.instance

  // Fase 0: so mensagens recebidas. Outros eventos (status/conexao/qrcode) sao
  // logados pelo route handler e ignorados aqui por ora.
  const ehMsg = evento === "messages.upsert" || evento === "MESSAGES_UPSERT"
  if (!ehMsg) return { ok: true, info: `evento ignorado na fase 0: ${evento}` }

  const db = getSupabaseAdmin()
  if (!db) return { ok: false, erro: "service_role_ausente" }
  if (!instanceName) return { ok: false, erro: "instance ausente no payload" }

  // Resolve a instancia -> empresa.
  const { data: inst } = await db
    .from("crm_instancias")
    .select("id, empresa_slug, ativo")
    .eq("instance_name", instanceName)
    .maybeSingle()
  if (!inst || inst.ativo === false) {
    return { ok: true, info: `instancia desconhecida/inativa: ${instanceName}` }
  }
  const empresaSlug = inst.empresa_slug as string
  const instanciaId = inst.id as string

  // Nome da empresa (denormalizado no lead).
  const { data: emp } = await db
    .from("empresas_config")
    .select("nome")
    .eq("slug", empresaSlug)
    .maybeSingle()
  const empresaNome = (emp?.nome as string) ?? empresaSlug

  // data pode vir como objeto unico ou array.
  const bruto = payload?.data
  const mensagens = Array.isArray(bruto) ? bruto : bruto ? [bruto] : []
  let novas = 0
  let duplicadas = 0
  let ignoradas = 0

  for (const m of mensagens) {
    const telefone = telefoneDoJid(m?.key?.remoteJid)
    if (!telefone) {
      ignoradas++
      continue
    }
    // wa_message_id e a chave de idempotencia (instancia_id, wa_message_id).
    // Sem ele, NULL e distinto de NULL no Postgres e a reentrega duplicaria —
    // entao ignoramos mensagens sem id (raras: protocolo/sistema; o
    // messages.upsert real sempre traz key.id).
    const waMessageId: string | null = m?.key?.id ?? null
    if (!waMessageId) {
      ignoradas++
      continue
    }
    const fromMe = Boolean(m?.key?.fromMe)
    const pushName = (m?.pushName as string) ?? null
    const tipo = mapearTipo(m?.messageType)
    const conteudo = extrairTexto(m?.message)
    const waTs = tsParaIso(m?.messageTimestamp)
    const agora = new Date().toISOString()

    // 1) Resolve/cria o lead (sem incrementar nao_lidas ainda).
    let leadId: string | null = null
    let leadNome: string | null = null
    const { data: existente } = await db
      .from("crm_leads")
      .select("id, nome")
      .eq("empresa_slug", empresaSlug)
      .eq("telefone_e164", telefone)
      .maybeSingle()
    if (existente) {
      leadId = existente.id as string
      leadNome = (existente.nome as string) ?? null
    } else {
      const { data: etapa } = await db
        .from("crm_etapas")
        .select("id")
        .eq("ativo", true)
        .order("ordem", { ascending: true })
        .limit(1)
        .maybeSingle()
      const { data: novo, error: errLead } = await db
        .from("crm_leads")
        .insert({
          empresa_slug: empresaSlug,
          empresa_nome: empresaNome,
          telefone_e164: telefone,
          nome: pushName,
          origem: "whatsapp",
          etapa_id: etapa?.id ?? null,
          status: "aberto",
          ultima_interacao_em: waTs ?? agora,
          nao_lidas: 0,
        })
        .select("id")
        .single()
      if (errLead || !novo) {
        // Corrida: outra entrega criou o lead — re-seleciona.
        const { data: req } = await db
          .from("crm_leads")
          .select("id, nome")
          .eq("empresa_slug", empresaSlug)
          .eq("telefone_e164", telefone)
          .maybeSingle()
        if (!req) {
          ignoradas++
          continue
        }
        leadId = req.id as string
        leadNome = (req.nome as string) ?? null
      } else {
        leadId = novo.id as string
      }
    }

    // 2) Grava a mensagem (idempotente por instancia_id+wa_message_id).
    const { data: inseridas, error: errMsg } = await db
      .from("crm_mensagens")
      .upsert(
        {
          lead_id: leadId,
          instancia_id: instanciaId,
          empresa_slug: empresaSlug,
          direcao: "in",
          tipo,
          conteudo,
          wa_message_id: waMessageId,
          status: "recebida",
          from_me: fromMe,
          wa_timestamp: waTs,
          metadados: { messageType: m?.messageType ?? null },
        },
        { onConflict: "instancia_id,wa_message_id", ignoreDuplicates: true }
      )
      .select("id")
    if (errMsg) {
      console.error("[crm-inbound] erro ao gravar msg", errMsg.message)
      ignoradas++
      continue
    }
    const foiNova = Array.isArray(inseridas) && inseridas.length > 0
    if (!foiNova) {
      duplicadas++
      continue
    }
    novas++

    // 3) Mensagem nova: atualiza o lead (+1 nao-lida so se veio do cliente) e
    //    emite o ping de realtime (sem PII).
    const { data: leadAtual } = await db
      .from("crm_leads")
      .select("nao_lidas")
      .eq("id", leadId as string)
      .maybeSingle()
    const naoLidas = ((leadAtual?.nao_lidas as number) ?? 0) + (fromMe ? 0 : 1)
    await db
      .from("crm_leads")
      .update({
        ultima_interacao_em: waTs ?? agora,
        nao_lidas: naoLidas,
        nome: leadNome ?? pushName,
        updated_at: agora,
      })
      .eq("id", leadId as string)

    await db
      .from("crm_realtime_ping")
      .insert({ empresa_slug: empresaSlug, lead_id: leadId, kind: "msg" })
  }

  return {
    ok: true,
    info: `msgs: ${novas} novas, ${duplicadas} duplicadas, ${ignoradas} ignoradas`,
  }
}
