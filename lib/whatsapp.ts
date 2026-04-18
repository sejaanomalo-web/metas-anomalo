const GRAPH = "https://graph.facebook.com/v21.0"

export interface ResultadoEnvio {
  ok: boolean
  erro?: string
  enviados?: number
}

function numerosDestinatarios(): string[] {
  const principal = process.env.WHATSAPP_NUMBER
  const extras = process.env.WHATSAPP_NUMBERS
  const lista: string[] = []
  if (principal) lista.push(principal.trim())
  if (extras) {
    for (const n of extras.split(",")) {
      const v = n.trim()
      if (v && !lista.includes(v)) lista.push(v)
    }
  }
  return lista
}

export async function enviarWhatsApp(
  mensagem: string,
  destinatarios?: string[]
): Promise<ResultadoEnvio> {
  const token = process.env.WHATSAPP_TOKEN
  const phoneId = process.env.WHATSAPP_PHONE_ID
  if (!token || !phoneId) {
    return {
      ok: false,
      erro:
        "Configuração WhatsApp ausente — defina WHATSAPP_TOKEN e WHATSAPP_PHONE_ID",
    }
  }

  const numeros =
    destinatarios && destinatarios.length > 0
      ? destinatarios
      : numerosDestinatarios()
  if (numeros.length === 0) {
    return { ok: false, erro: "Nenhum destinatário WhatsApp configurado" }
  }

  let enviados = 0
  let ultimoErro: string | null = null
  for (const numero of numeros) {
    try {
      const res = await fetch(`${GRAPH}/${phoneId}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: numero,
          type: "text",
          text: { body: mensagem, preview_url: true },
        }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null
        ultimoErro =
          body?.error?.message ?? `WhatsApp API respondeu ${res.status}`
        continue
      }
      enviados++
    } catch (e) {
      ultimoErro = e instanceof Error ? e.message : "Erro ao chamar WhatsApp"
    }
  }

  return enviados > 0
    ? { ok: true, enviados }
    : { ok: false, erro: ultimoErro ?? "Nenhuma mensagem enviada" }
}

export function verificarCronSecret(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true // sem secret, libera (desenvolvimento)
  const auth = req.headers.get("authorization") ?? ""
  return auth === `Bearer ${secret}`
}
