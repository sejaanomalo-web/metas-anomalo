// =============================================================================
// Cliente da Evolution API (WhatsApp via QR) — ENVIO de mensagens do CRM.
// =============================================================================
// Espelha lib/whatsapp.ts (Meta Cloud API): NUNCA propaga excecao; cada envio
// retorna { ok, ... }. NAMESPACE totalmente separado do Meta (META_WHATSAPP_*):
// o CRM usa EVOLUTION_*; os dois coexistem e NAO se cruzam.
//
//   EVOLUTION_API_URL  - base da instalacao Evolution (sem NEXT_PUBLIC, secreta)
//   EVOLUTION_API_KEY  - apikey global (header 'apikey')
// =============================================================================

export interface ResultadoEvolution {
  ok: boolean
  /** key.id da mensagem na Evolution quando ok. */
  messageId?: string
  /** mensagem de erro quando falha. */
  erro?: string
  /** status HTTP da resposta da Evolution, quando houve. */
  status?: number
}

/**
 * Envia uma mensagem de texto por uma instancia Evolution.
 *
 * @param instanceName  nome EXATO da instancia (crm_instancias.instance_name)
 * @param telefoneE164  numero destino sem "+" (ex: 5545999999999)
 * @param texto         corpo da mensagem
 */
export async function enviarTextoEvolution(
  instanceName: string,
  telefoneE164: string,
  texto: string
): Promise<ResultadoEvolution> {
  const base = process.env.EVOLUTION_API_URL
  const apikey = process.env.EVOLUTION_API_KEY
  if (!base || !apikey) {
    console.error("[evolution] EVOLUTION_API_URL ou EVOLUTION_API_KEY ausente")
    return { ok: false, erro: "credenciais_ausentes" }
  }

  const url = `${base.replace(/\/$/, "")}/message/sendText/${encodeURIComponent(
    instanceName
  )}`

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { apikey, "Content-Type": "application/json" },
      body: JSON.stringify({ number: telefoneE164, text: texto }),
      // Timeout defensivo (mesma logica do lib/whatsapp.ts).
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    })

    const json: unknown = await resp.json().catch(() => null)

    if (!resp.ok) {
      const obj = (json ?? {}) as Record<string, unknown>
      const msg =
        (typeof obj.message === "string" && obj.message) ||
        (typeof obj.error === "string" && obj.error) ||
        `HTTP ${resp.status}`
      console.error(
        `[evolution] falha sendText (${instanceName} -> ${telefoneE164}): ` +
          `${resp.status} ${JSON.stringify(json)}`
      )
      return { ok: false, erro: String(msg), status: resp.status }
    }

    // Evolution responde com { key: { id }, ... } no sucesso.
    const obj = (json ?? {}) as {
      key?: { id?: string }
      message?: { key?: { id?: string } }
    }
    const messageId = obj.key?.id ?? obj.message?.key?.id
    return { ok: true, messageId, status: resp.status }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error(`[evolution] erro de rede sendText (${instanceName}): ${msg}`)
    return { ok: false, erro: msg }
  }
}

/**
 * Envia um audio (nota de voz) por uma instancia Evolution. Aceita base64
 * (com ou sem prefixo data:) — a Evolution transcodifica pro formato PTT do
 * WhatsApp via ffmpeg. Endpoint: /message/sendWhatsAppAudio/{instance}.
 */
export async function enviarAudioEvolution(
  instanceName: string,
  telefoneE164: string,
  audioBase64: string
): Promise<ResultadoEvolution> {
  const base = process.env.EVOLUTION_API_URL
  const apikey = process.env.EVOLUTION_API_KEY
  if (!base || !apikey) {
    console.error("[evolution] EVOLUTION_API_URL ou EVOLUTION_API_KEY ausente")
    return { ok: false, erro: "credenciais_ausentes" }
  }

  // A Evolution quer o base64 puro (sem o prefixo "data:audio/...;base64,").
  const audioLimpo = audioBase64.includes(",")
    ? audioBase64.slice(audioBase64.indexOf(",") + 1)
    : audioBase64

  const url = `${base.replace(/\/$/, "")}/message/sendWhatsAppAudio/${encodeURIComponent(
    instanceName
  )}`

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { apikey, "Content-Type": "application/json" },
      body: JSON.stringify({ number: telefoneE164, audio: audioLimpo }),
      // Audio e maior que texto — timeout mais folgado.
      signal: AbortSignal.timeout(30_000),
      cache: "no-store",
    })
    const json: unknown = await resp.json().catch(() => null)
    if (!resp.ok) {
      const obj = (json ?? {}) as Record<string, unknown>
      const msg =
        (typeof obj.message === "string" && obj.message) ||
        (typeof obj.error === "string" && obj.error) ||
        `HTTP ${resp.status}`
      console.error(
        `[evolution] falha sendWhatsAppAudio (${instanceName} -> ${telefoneE164}): ` +
          `${resp.status} ${JSON.stringify(json)}`
      )
      return { ok: false, erro: String(msg), status: resp.status }
    }
    const obj = (json ?? {}) as {
      key?: { id?: string }
      message?: { key?: { id?: string } }
    }
    const messageId = obj.key?.id ?? obj.message?.key?.id
    return { ok: true, messageId, status: resp.status }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error(`[evolution] erro de rede sendWhatsAppAudio (${instanceName}): ${msg}`)
    return { ok: false, erro: msg }
  }
}

/**
 * Busca a URL da foto de perfil de um numero (estilo WhatsApp). Retorna null
 * se o contato nao tem foto, e privada, ou a instancia esta offline — nunca
 * lanca (best-effort; a UI cai pro avatar de iniciais).
 * Endpoint: /chat/fetchProfilePictureUrl/{instance}.
 */
export async function buscarFotoPerfilEvolution(
  instanceName: string,
  telefoneE164: string
): Promise<string | null> {
  const base = process.env.EVOLUTION_API_URL
  const apikey = process.env.EVOLUTION_API_KEY
  if (!base || !apikey) return null

  const url = `${base.replace(/\/$/, "")}/chat/fetchProfilePictureUrl/${encodeURIComponent(
    instanceName
  )}`
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { apikey, "Content-Type": "application/json" },
      body: JSON.stringify({ number: telefoneE164 }),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    })
    if (!resp.ok) return null
    const json = (await resp.json().catch(() => null)) as Record<string, any> | null
    const foto = json?.profilePictureUrl ?? json?.profilePicUrl ?? json?.url
    return typeof foto === "string" && foto.startsWith("http") ? foto : null
  } catch {
    return null
  }
}

export interface PerfilContatoEvolution {
  nome: string | null
  sobre: string | null
  foto: string | null
}

/**
 * Busca o perfil de um contato no WhatsApp (nome salvo/pushname, recado/status
 * e foto) por uma instancia. Best-effort: retorna todos os campos null em
 * qualquer falha. Endpoint: /chat/fetchProfile/{instance}.
 */
export async function buscarPerfilContatoEvolution(
  instanceName: string,
  telefoneE164: string
): Promise<PerfilContatoEvolution> {
  const vazio: PerfilContatoEvolution = { nome: null, sobre: null, foto: null }
  const base = process.env.EVOLUTION_API_URL
  const apikey = process.env.EVOLUTION_API_KEY
  if (!base || !apikey) return vazio

  const url = `${base.replace(/\/$/, "")}/chat/fetchProfile/${encodeURIComponent(
    instanceName
  )}`
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { apikey, "Content-Type": "application/json" },
      body: JSON.stringify({ number: telefoneE164 }),
      signal: AbortSignal.timeout(12_000),
      cache: "no-store",
    })
    if (!resp.ok) return vazio
    const json = (await resp.json().catch(() => null)) as Record<string, any> | null
    if (!json) return vazio
    // A forma varia entre builds: name/pushName/verifiedName; status pode vir
    // string ou objeto { status }. picture/profilePictureUrl pra foto.
    const nome =
      json.name ?? json.pushName ?? json.verifiedName ?? json.wpp_name ?? null
    const statusBruto = json.status
    const sobre =
      typeof statusBruto === "string"
        ? statusBruto
        : (statusBruto?.status as string) ?? json.about ?? null
    const fotoBruta = json.picture ?? json.profilePictureUrl ?? json.profilePicUrl ?? null
    return {
      nome: typeof nome === "string" && nome.trim() ? nome.trim() : null,
      sobre: typeof sobre === "string" && sobre.trim() ? sobre.trim() : null,
      foto:
        typeof fotoBruta === "string" && fotoBruta.startsWith("http")
          ? fotoBruta
          : null,
    }
  } catch {
    return vazio
  }
}

/**
 * Baixa o binario (base64) de uma mensagem de midia recebida — a Evolution
 * nao manda o conteudo no webhook por padrao, so os metadados. Best-effort:
 * retorna null em qualquer falha (a UI mostra "[audio]/[imagem]" como antes).
 * Endpoint: /chat/getBase64FromMediaMessage/{instance}.
 */
export async function baixarMidiaEvolution(
  instanceName: string,
  waMessage: unknown
): Promise<{ base64: string; mimetype: string | null } | null> {
  const base = process.env.EVOLUTION_API_URL
  const apikey = process.env.EVOLUTION_API_KEY
  if (!base || !apikey) return null

  const url = `${base.replace(/\/$/, "")}/chat/getBase64FromMediaMessage/${encodeURIComponent(
    instanceName
  )}`
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { apikey, "Content-Type": "application/json" },
      body: JSON.stringify({ message: waMessage, convertToMp4: false }),
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    })
    if (!resp.ok) return null
    const json = (await resp.json().catch(() => null)) as Record<string, any> | null
    const base64 = json?.base64 ?? json?.media ?? null
    if (typeof base64 !== "string" || base64.length === 0) return null
    const mimetype =
      (typeof json?.mimetype === "string" && json.mimetype) ||
      (typeof json?.mimeType === "string" && json.mimeType) ||
      null
    return { base64, mimetype }
  } catch {
    return null
  }
}

export interface ResultadoInstanciaEvolution {
  ok: boolean
  erro?: string
  status?: number
}

async function extrairErroResposta(resp: Response): Promise<string> {
  const json: unknown = await resp.json().catch(() => null)
  const obj = (json ?? {}) as Record<string, unknown>
  return (
    (typeof obj.message === "string" && obj.message) ||
    (typeof obj.error === "string" && obj.error) ||
    `HTTP ${resp.status}`
  )
}

/**
 * Cria uma instancia nova na Evolution API. NAO retorna o QR aqui — o QR
 * chega pelo evento QRCODE_UPDATED do webhook (lib/crm-inbound.ts), que
 * persiste em crm_instancias.ultimo_qr. Chamar antes disso
 * crm_instancias.insert() com o mesmo instanceName.
 */
export async function criarInstanciaEvolution(
  instanceName: string
): Promise<ResultadoInstanciaEvolution> {
  const base = process.env.EVOLUTION_API_URL
  const apikey = process.env.EVOLUTION_API_KEY
  if (!base || !apikey) {
    console.error("[evolution] EVOLUTION_API_URL ou EVOLUTION_API_KEY ausente")
    return { ok: false, erro: "credenciais_ausentes" }
  }

  const url = `${base.replace(/\/$/, "")}/instance/create`

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { apikey, "Content-Type": "application/json" },
      body: JSON.stringify({
        instanceName,
        qrcode: true,
        integration: "WHATSAPP-BAILEYS",
      }),
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    })
    if (!resp.ok) {
      const msg = await extrairErroResposta(resp)
      console.error(
        `[evolution] falha instance/create (${instanceName}): ${resp.status} ${msg}`
      )
      return { ok: false, erro: msg, status: resp.status }
    }
    return { ok: true, status: resp.status }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error(
      `[evolution] erro de rede instance/create (${instanceName}): ${msg}`
    )
    return { ok: false, erro: msg }
  }
}

/**
 * Dispara/renova a geracao do QR de uma instancia ja criada. A fonte de
 * verdade do QR continua sendo o evento QRCODE_UPDATED do webhook — esta
 * funcao so pede pra Evolution gerar um novo (ex: QR expirou).
 */
export async function conectarInstanciaEvolution(
  instanceName: string
): Promise<ResultadoInstanciaEvolution> {
  const base = process.env.EVOLUTION_API_URL
  const apikey = process.env.EVOLUTION_API_KEY
  if (!base || !apikey) {
    console.error("[evolution] EVOLUTION_API_URL ou EVOLUTION_API_KEY ausente")
    return { ok: false, erro: "credenciais_ausentes" }
  }

  const url = `${base.replace(/\/$/, "")}/instance/connect/${encodeURIComponent(
    instanceName
  )}`

  try {
    const resp = await fetch(url, {
      method: "GET",
      headers: { apikey },
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    })
    if (!resp.ok) {
      const msg = await extrairErroResposta(resp)
      console.error(
        `[evolution] falha instance/connect (${instanceName}): ${resp.status} ${msg}`
      )
      return { ok: false, erro: msg, status: resp.status }
    }
    return { ok: true, status: resp.status }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error(
      `[evolution] erro de rede instance/connect (${instanceName}): ${msg}`
    )
    return { ok: false, erro: msg }
  }
}

/**
 * Exclui uma instancia na Evolution (desloga o WhatsApp e apaga a sessao).
 * Tenta logout antes do delete (algumas builds exigem). Best-effort no logout;
 * o resultado reportado e o do delete. Idempotente: 404 (ja nao existe) conta
 * como sucesso, pra permitir limpar linhas orfas no nosso banco.
 */
export async function excluirInstanciaEvolution(
  instanceName: string
): Promise<ResultadoInstanciaEvolution> {
  const base = process.env.EVOLUTION_API_URL
  const apikey = process.env.EVOLUTION_API_KEY
  if (!base || !apikey) {
    console.error("[evolution] EVOLUTION_API_URL ou EVOLUTION_API_KEY ausente")
    return { ok: false, erro: "credenciais_ausentes" }
  }
  const raiz = base.replace(/\/$/, "")

  // 1) Logout (best-effort — ignora falha/404).
  try {
    await fetch(`${raiz}/instance/logout/${encodeURIComponent(instanceName)}`, {
      method: "DELETE",
      headers: { apikey },
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    })
  } catch {
    /* ignora — segue pro delete */
  }

  // 2) Delete (resultado reportado).
  try {
    const resp = await fetch(
      `${raiz}/instance/delete/${encodeURIComponent(instanceName)}`,
      {
        method: "DELETE",
        headers: { apikey },
        signal: AbortSignal.timeout(15_000),
        cache: "no-store",
      }
    )
    if (!resp.ok && resp.status !== 404) {
      const msg = await extrairErroResposta(resp)
      console.error(
        `[evolution] falha instance/delete (${instanceName}): ${resp.status} ${msg}`
      )
      return { ok: false, erro: msg, status: resp.status }
    }
    return { ok: true, status: resp.status }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error(
      `[evolution] erro de rede instance/delete (${instanceName}): ${msg}`
    )
    return { ok: false, erro: msg }
  }
}
