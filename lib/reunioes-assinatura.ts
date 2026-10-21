// Assinatura do webhook do Cal.com — só servidor (usa crypto do Node).

import { createHmac, timingSafeEqual } from "crypto"

/**
 * Valida `x-cal-signature-256`: HMAC-SHA256 (hex) do CORPO CRU com o segredo
 * do webhook. Fail-closed: sem segredo configurado, nada passa. Comparação em
 * tempo constante.
 */
export function assinaturaCalValida(
  corpoCru: string,
  cabecalho: string | null,
  segredo: string | undefined
): boolean {
  if (!segredo || !cabecalho) return false
  const recebido = cabecalho.trim().replace(/^sha256=/i, "").toLowerCase()
  if (!/^[0-9a-f]{64}$/.test(recebido)) return false
  const esperado = createHmac("sha256", segredo).update(corpoCru, "utf8").digest("hex")
  const a = Buffer.from(recebido, "hex")
  const b = Buffer.from(esperado, "hex")
  return a.length === b.length && timingSafeEqual(a, b)
}
