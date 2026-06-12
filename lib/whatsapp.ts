// =============================================================================
// Cliente da Meta WhatsApp Cloud API - somente ENVIO de template aprovado.
// =============================================================================
// Usado pelo cron /api/wa/diario. Regra principal: NUNCA propaga excecao pra
// cima. Cada envio retorna { ok, ... } pra que uma falha isolada (numero ruim,
// API fora, rate limit) nao derrube a fila inteira de envios do dia.
//
// Credenciais via ambiente (Vercel), sem prefixo NEXT_PUBLIC (sao secretas):
//   META_WHATSAPP_PHONE_ID  - id do numero remetente (Phone Number ID)
//   META_WHATSAPP_TOKEN     - access token permanente do WhatsApp Business
// =============================================================================

const GRAPH_VERSION = "v21.0"

export interface ResultadoEnvio {
  ok: boolean
  /** id da mensagem na Meta quando ok. */
  messageId?: string
  /** mensagem de erro quando falha. */
  erro?: string
  /** status HTTP da resposta da Meta, quando houve resposta. */
  status?: number
}

/**
 * Dispara um template aprovado na Meta para um numero E.164.
 *
 * @param telefoneE164  numero sem "+" e sem espacos, ex: 5545999999999
 * @param nomeTemplate  nome exato do template aprovado (ex: relatorio_trafego)
 * @param variaveis     valores de {{1}}..{{n}} do corpo, na ordem
 *
 * Idioma fixo pt_BR (precisa bater com o idioma do template aprovado).
 */
export async function enviarTemplate(
  telefoneE164: string,
  nomeTemplate: string,
  variaveis: string[]
): Promise<ResultadoEnvio> {
  const phoneId = process.env.META_WHATSAPP_PHONE_ID
  const token = process.env.META_WHATSAPP_TOKEN

  if (!phoneId || !token) {
    console.error(
      "[whatsapp] META_WHATSAPP_PHONE_ID ou META_WHATSAPP_TOKEN ausente no ambiente"
    )
    return { ok: false, erro: "credenciais_ausentes" }
  }

  // Cada variavel vira um parametro de texto no componente "body" do template.
  const parametros = variaveis.map((v) => ({ type: "text", text: v }))

  const body = {
    messaging_product: "whatsapp",
    to: telefoneE164,
    type: "template",
    template: {
      name: nomeTemplate,
      language: { code: "pt_BR" },
      components: [{ type: "body", parameters: parametros }],
    },
  }

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${phoneId}/messages`

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      // Timeout defensivo: a Cloud API responde em ~1-2s. 15s evita que um
      // envio travado segure a função serverless até o limite. Estouro cai
      // no catch abaixo (já tratado como falha de rede deste envio).
      signal: AbortSignal.timeout(15_000),
    })

    // A Meta responde JSON tanto no sucesso quanto no erro.
    const json: any = await resp.json().catch(() => null)

    if (!resp.ok) {
      // Formato de erro da Meta: { error: { message, code, error_data, ... } }.
      const msg = json?.error?.message ?? `HTTP ${resp.status}`
      console.error(
        `[whatsapp] falha ao enviar "${nomeTemplate}" para ${telefoneE164}: ` +
          `${resp.status} ${JSON.stringify(json?.error ?? json)}`
      )
      return { ok: false, erro: msg, status: resp.status }
    }

    const messageId = json?.messages?.[0]?.id
    return { ok: true, messageId, status: resp.status }
  } catch (e) {
    // Erro de rede/timeout: nao propaga, so reporta a falha deste envio.
    const msg = e instanceof Error ? e.message : String(e)
    console.error(
      `[whatsapp] erro de rede ao enviar "${nomeTemplate}" para ${telefoneE164}: ${msg}`
    )
    return { ok: false, erro: msg }
  }
}
