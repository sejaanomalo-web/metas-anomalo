// Cabeçalhos HTTP da página pública do funil (somente servidor: usa node:crypto).
// Separado de funil-estaticos-pagina.ts para que o renderizador de HTML continue
// puro e possa ser usado também na pré-visualização do painel (iframe srcdoc).
import { createHash } from "node:crypto"
import { SCRIPT_CLIENTE } from "./funil-estaticos-cliente"

const HASH_SCRIPT = `'sha256-${createHash("sha256").update(SCRIPT_CLIENTE).digest("base64")}'`

export function cabecalhosSeguranca(): Record<string, string> {
  return {
    "content-security-policy": [
      "default-src 'self'",
      `script-src 'self' ${HASH_SCRIPT} https://connect.facebook.net`,
      "style-src 'unsafe-inline'",
      "img-src 'self' data: https://www.facebook.com",
      "connect-src 'self' https://www.facebook.com https://connect.facebook.net",
      "frame-src https://www.facebook.com",
      "base-uri 'none'", "form-action 'self'", "frame-ancestors 'none'", "object-src 'none'",
    ].join("; "),
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    "x-robots-tag": "noindex, nofollow",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
  }
}
