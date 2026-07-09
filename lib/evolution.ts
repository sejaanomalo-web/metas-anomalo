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
