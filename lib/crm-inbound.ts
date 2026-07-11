// =============================================================================
// CRM — processamento de webhooks da Evolution (INBOUND). Server-only (usa
// service_role; importado pelo route handler do webhook, nunca pelo client).
// =============================================================================
// Fase 0: messages.upsert — cria/mergeia o lead, grava a mensagem recebida
// (idempotente por instancia_id+wa_message_id) e emite o ping de realtime.
// Fase 1: QRCODE_UPDATED/CONNECTION_UPDATE — reflete status_conexao/ultimo_qr
// em crm_instancias pra UI de admin de conexao.
// Fase 2: CONTACTS_UPSERT/CONTACTS_UPDATE — cacheia o nome salvo no celular
// (crm_contatos), preferido sobre o pushName ao criar/atualizar um lead.
// Leads/mensagens herdam usuario_id/usuario_nome da instancia (isolamento
// por usuario). Status de entrega (mensagem lida/entregue) e outbound
// continuam fora do escopo. NUNCA lanca excecao fatal pro webhook: retorna
// { ok, info?, erro? }.

import { getSupabaseAdmin } from "./supabase"
import {
  buscarFotoPerfilEvolution,
  baixarMidiaEvolution,
} from "./evolution"
import { uploadMidiaCrm } from "./crm-midia"

interface ResultadoProcessamento {
  ok: boolean
  info?: string
  erro?: string
}

/** Previa curta da ultima mensagem pra lista de conversas (estilo WhatsApp).
 *  Midia vira um rotulo com icone; texto e truncado. */
function previewMensagem(tipo: string, conteudo: string | null): string {
  const t = (conteudo ?? "").trim()
  switch (tipo) {
    case "audio":
      return "🎤 Áudio"
    case "imagem":
      return t ? `🖼️ ${t}` : "🖼️ Imagem"
    case "video":
      return t ? `🎬 ${t}` : "🎬 Vídeo"
    case "documento":
      return t ? `📄 ${t}` : "📄 Documento"
    case "figurinha":
      return "🌟 Figurinha"
    case "localizacao":
      return "📍 Localização"
    case "contato":
      return "👤 Contato"
    default:
      return t.length > 90 ? `${t.slice(0, 90)}…` : t
  }
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

/** Extrai o base64 do QR do payload (formatos variam entre builds da
 *  Evolution: data.qrcode.base64, data.base64, ou data como string crua). */
function extrairQrBase64(data: unknown): string | null {
  if (!data) return null
  if (typeof data === "string") return data
  const d = data as Record<string, any>
  return d.qrcode?.base64 ?? d.base64 ?? d.qrcode ?? null
}

/** Mapeia o `state` da Evolution/Baileys pro enum de status_conexao. */
function mapearStatusConexao(state: unknown): string | null {
  switch (state) {
    case "open":
      return "conectado"
    case "close":
      return "desconectado"
    case "connecting":
      return "qrcode"
    default:
      return null
  }
}

async function processarQrcodeUpdate(
  instanceName: string | undefined,
  data: unknown
): Promise<ResultadoProcessamento> {
  const db = getSupabaseAdmin()
  if (!db) return { ok: false, erro: "service_role_ausente" }
  if (!instanceName) return { ok: false, erro: "instance ausente no payload" }

  const qr = extrairQrBase64(data)
  if (!qr) return { ok: true, info: "qrcode_updated sem base64 no payload" }

  const { data: inst } = await db
    .from("crm_instancias")
    .select("id, empresa_slug")
    .eq("instance_name", instanceName)
    .maybeSingle()
  if (!inst) return { ok: true, info: `instancia desconhecida: ${instanceName}` }

  await db
    .from("crm_instancias")
    .update({
      ultimo_qr: qr,
      status_conexao: "qrcode",
      updated_at: new Date().toISOString(),
    })
    .eq("id", inst.id)

  await db
    .from("crm_realtime_ping")
    .insert({ empresa_slug: inst.empresa_slug as string, kind: "conexao" })

  return { ok: true, info: "qrcode atualizado" }
}

async function processarConnectionUpdate(
  instanceName: string | undefined,
  data: unknown
): Promise<ResultadoProcessamento> {
  const db = getSupabaseAdmin()
  if (!db) return { ok: false, erro: "service_role_ausente" }
  if (!instanceName) return { ok: false, erro: "instance ausente no payload" }

  const status = mapearStatusConexao((data as Record<string, any>)?.state)
  if (!status) {
    return {
      ok: true,
      info: `connection_update com state desconhecido: ${(data as any)?.state}`,
    }
  }

  const { data: inst } = await db
    .from("crm_instancias")
    .select("id, empresa_slug")
    .eq("instance_name", instanceName)
    .maybeSingle()
  if (!inst) return { ok: true, info: `instancia desconhecida: ${instanceName}` }

  const agora = new Date().toISOString()
  const patch: Record<string, unknown> = {
    status_conexao: status,
    updated_at: agora,
  }
  if (status === "conectado") {
    patch.conectado_em = agora
    patch.ultimo_qr = null // QR ja foi usado, evita reexibir na UI
  }

  await db.from("crm_instancias").update(patch).eq("id", inst.id)

  await db
    .from("crm_realtime_ping")
    .insert({ empresa_slug: inst.empresa_slug as string, kind: "conexao" })

  return { ok: true, info: `conexao: ${status}` }
}

// Limite defensivo pro sync inicial de contatos (a Evolution manda o catalogo
// inteiro do celular no primeiro CONTACTS_UPSERT apos conectar — pode ser
// centenas). Processa os primeiros N por chamada; entregas seguintes (a
// Evolution reenvia em lotes) completam o resto.
const MAX_CONTATOS_POR_EVENTO = 300

async function processarContatosEvento(
  instanceName: string | undefined,
  data: unknown
): Promise<ResultadoProcessamento> {
  const db = getSupabaseAdmin()
  if (!db) return { ok: false, erro: "service_role_ausente" }
  if (!instanceName) return { ok: false, erro: "instance ausente no payload" }

  const { data: inst } = await db
    .from("crm_instancias")
    .select("id, empresa_slug")
    .eq("instance_name", instanceName)
    .maybeSingle()
  if (!inst) return { ok: true, info: `instancia desconhecida: ${instanceName}` }
  const instanciaId = inst.id as string
  const empresaSlug = inst.empresa_slug as string

  const bruto = data
  const lista = (Array.isArray(bruto) ? bruto : bruto ? [bruto] : []).slice(
    0,
    MAX_CONTATOS_POR_EVENTO
  )
  const agora = new Date().toISOString()

  // "name" (as-vezes "verifiedName") e o nome salvo no celular — mais
  // autoritativo que pushName/notify, que e autodeclarado pelo contato.
  // profilePicUrl (quando vem) alimenta a foto do avatar (estilo WhatsApp).
  const linhas = lista
    .map((c) => {
      const registro = c as Record<string, any>
      const telefone = telefoneDoJid(registro?.id)
      const nome = registro?.name ?? registro?.verifiedName ?? null
      const fotoRaw =
        registro?.profilePicUrl ?? registro?.profilePictureUrl ?? null
      const foto =
        typeof fotoRaw === "string" && fotoRaw.startsWith("http") ? fotoRaw : null
      // Guarda se tiver telefone E (nome OU foto) — so foto ja vale o cache.
      if (!telefone || (!nome && !foto)) return null
      return { telefone_e164: telefone, nome, foto_url: foto }
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)

  if (linhas.length === 0) {
    return { ok: true, info: "contatos sem nome/foto/telefone valido nesta entrega" }
  }

  // Upsert em ATE dois lotes separados por coluna — um so com `nome`, outro so
  // com `foto_url`. Eventos da Evolution sao PARCIAIS (uma atualizacao de foto
  // vem sem nome, e vice-versa); um lote misto faria SET na coluna ausente com
  // null e zeraria o cache. Cada lote so toca a propria coluna, preservando a
  // outra ja cacheada.
  const comNome = linhas
    .filter((l) => l.nome)
    .map((l) => ({
      instancia_id: instanciaId,
      telefone_e164: l.telefone_e164,
      nome: l.nome,
      updated_at: agora,
    }))
  const comFoto = linhas
    .filter((l) => l.foto_url)
    .map((l) => ({
      instancia_id: instanciaId,
      telefone_e164: l.telefone_e164,
      foto_url: l.foto_url,
      updated_at: agora,
    }))

  if (comNome.length > 0) {
    const { error } = await db
      .from("crm_contatos")
      .upsert(comNome, { onConflict: "instancia_id,telefone_e164" })
    if (error) console.error("[crm-inbound] erro ao cachear nomes de contatos", error.message)
  }
  if (comFoto.length > 0) {
    const { error } = await db
      .from("crm_contatos")
      .upsert(comFoto, { onConflict: "instancia_id,telefone_e164" })
    if (error) console.error("[crm-inbound] erro ao cachear fotos de contatos", error.message)
  }

  // Mantem leads JA existentes com nome/foto sincronizados (so afeta quem ja
  // trocou mensagem — a maioria dos contatos do sync inicial nao tem lead).
  // O nome so e atualizado quando nome_manual=false (nome digitado à mão
  // manda); a foto e sempre atualizada.
  for (const l of linhas) {
    if (l.nome) {
      await db
        .from("crm_leads")
        .update({ nome: l.nome })
        .eq("empresa_slug", empresaSlug)
        .eq("telefone_e164", l.telefone_e164)
        .eq("nome_manual", false)
    }
    if (l.foto_url) {
      await db
        .from("crm_leads")
        .update({ foto_url: l.foto_url })
        .eq("empresa_slug", empresaSlug)
        .eq("telefone_e164", l.telefone_e164)
    }
  }

  return { ok: true, info: `contatos cacheados: ${linhas.length}` }
}

export async function processarEventoWebhook(
  payload: any
): Promise<ResultadoProcessamento> {
  const evento: string = payload?.event ?? ""
  const instanceName: string | undefined = payload?.instance

  if (evento === "qrcode.updated" || evento === "QRCODE_UPDATED") {
    return processarQrcodeUpdate(instanceName, payload?.data)
  }
  if (evento === "connection.update" || evento === "CONNECTION_UPDATE") {
    return processarConnectionUpdate(instanceName, payload?.data)
  }
  if (
    evento === "contacts.upsert" ||
    evento === "CONTACTS_UPSERT" ||
    evento === "contacts.update" ||
    evento === "CONTACTS_UPDATE"
  ) {
    return processarContatosEvento(instanceName, payload?.data)
  }

  // Fase 1: mensagens recebidas + conexao/QR (acima). Demais eventos (status
  // de entrega/leitura, etc.) seguem ignorados por ora.
  const ehMsg = evento === "messages.upsert" || evento === "MESSAGES_UPSERT"
  if (!ehMsg) return { ok: true, info: `evento ignorado: ${evento}` }

  const db = getSupabaseAdmin()
  if (!db) return { ok: false, erro: "service_role_ausente" }
  if (!instanceName) return { ok: false, erro: "instance ausente no payload" }

  // Resolve a instancia -> empresa (+ dono, herdado pelo lead/mensagem).
  const { data: inst } = await db
    .from("crm_instancias")
    .select("id, empresa_slug, ativo, usuario_id, usuario_nome")
    .eq("instance_name", instanceName)
    .maybeSingle()
  if (!inst || inst.ativo === false) {
    return { ok: true, info: `instancia desconhecida/inativa: ${instanceName}` }
  }
  const empresaSlug = inst.empresa_slug as string
  const instanciaId = inst.id as string
  const usuarioId = inst.usuario_id as string
  const usuarioNome = (inst.usuario_nome as string) ?? null

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
    const ehMidia =
      tipo === "audio" || tipo === "imagem" || tipo === "video" || tipo === "documento"

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
      // Nome salvo no celular (crm_contatos) e mais autoritativo que o
      // pushName autodeclarado — prefere ele quando ja sincronizado. Num
      // fromMe o pushName e o MEU nome, entao nao serve de nome do contato.
      const { data: contato } = await db
        .from("crm_contatos")
        .select("nome, foto_url")
        .eq("instancia_id", instanciaId)
        .eq("telefone_e164", telefone)
        .maybeSingle()
      const nomeInicial =
        (contato?.nome as string) ?? (fromMe ? null : pushName)
      // Foto de perfil (estilo WhatsApp): usa a do cache, senao busca na
      // Evolution — best-effort, so na criacao do lead (1x por contato novo).
      const fotoInicial =
        (contato?.foto_url as string) ??
        (await buscarFotoPerfilEvolution(instanceName, telefone))
      const { data: novo, error: errLead } = await db
        .from("crm_leads")
        .insert({
          empresa_slug: empresaSlug,
          empresa_nome: empresaNome,
          usuario_id: usuarioId,
          usuario_nome: usuarioNome,
          telefone_e164: telefone,
          nome: nomeInicial,
          foto_url: fotoInicial,
          origem: "whatsapp",
          etapa_id: etapa?.id ?? null,
          status: "aberto",
          ultima_interacao_em: waTs ?? agora,
          ultima_msg_preview: previewMensagem(tipo, conteudo),
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
          usuario_id: usuarioId,
          // fromMe = enviada pelo PROPRIO celular -> lado direito (igual as
          // enviadas pelo CRM). Corrige o bug de aparecerem como do cliente.
          direcao: fromMe ? "out" : "in",
          tipo,
          conteudo,
          // Preenchido logo abaixo, so pra mensagem NOVA (evita rebaixar/
          // resubir a midia numa reentrega do webhook).
          midia_url: null,
          wa_message_id: waMessageId,
          status: fromMe ? "enviada" : "recebida",
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
    const novaMsgId =
      Array.isArray(inseridas) && inseridas.length > 0
        ? (inseridas[0].id as string)
        : null
    if (!novaMsgId) {
      duplicadas++
      continue
    }
    novas++

    // Midia (audio/imagem/video/documento): o webhook so traz metadados —
    // baixa o binario da Evolution e sobe pro storage, SO pra mensagem nova.
    // Best-effort: se falhar, a mensagem fica com o rotulo do tipo (a UI cai
    // pra "🎤 Áudio"/"🖼️ Imagem").
    if (ehMidia) {
      const midia = await baixarMidiaEvolution(instanceName, m)
      if (midia) {
        const url = await uploadMidiaCrm(midia.base64, midia.mimetype, `in/${empresaSlug}`)
        if (url) {
          await db.from("crm_mensagens").update({ midia_url: url }).eq("id", novaMsgId)
        }
      }
    }

    // 3) Mensagem nova: atualiza o lead (+1 nao-lida so se veio do cliente) e
    //    emite o ping de realtime (sem PII).
    const { data: leadAtual } = await db
      .from("crm_leads")
      .select("nao_lidas")
      .eq("id", leadId as string)
      .maybeSingle()
    const naoLidas = ((leadAtual?.nao_lidas as number) ?? 0) + (fromMe ? 0 : 1)
    const patchLead: Record<string, unknown> = {
      ultima_interacao_em: waTs ?? agora,
      nao_lidas: naoLidas,
      ultima_msg_preview: previewMensagem(tipo, conteudo),
      updated_at: agora,
    }
    // So preenche o nome via pushName se o lead ainda nao tem nome E a msg
    // veio DO cliente (num fromMe o pushName e o meu, nao serve).
    if (!leadNome && !fromMe && pushName) patchLead.nome = pushName
    await db.from("crm_leads").update(patchLead).eq("id", leadId as string)

    await db
      .from("crm_realtime_ping")
      .insert({ empresa_slug: empresaSlug, lead_id: leadId, kind: "msg" })
  }

  return {
    ok: true,
    info: `msgs: ${novas} novas, ${duplicadas} duplicadas, ${ignoradas} ignoradas`,
  }
}
