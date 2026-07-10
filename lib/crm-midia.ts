// =============================================================================
// CRM — upload de midia (audio/imagem) pro Supabase Storage. Server-only.
// =============================================================================
// Bucket 'crm-midia' (publico, criado na migracao fase3). URLs sao UUIDs
// nao-adivinhaveis. Best-effort: retorna null em qualquer falha — o chamador
// decide o fallback (ex: guardar o proprio data URL, ou mostrar placeholder).

import { randomUUID } from "crypto"
import { getSupabaseAdmin } from "./supabase"

const BUCKET = "crm-midia"

const EXT_POR_MIME: Record<string, string> = {
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/webm": "webm",
  "audio/wav": "wav",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
}

function extDoMime(mimetype: string | null): string {
  if (!mimetype) return "bin"
  const base = mimetype.split(";")[0].trim().toLowerCase()
  return EXT_POR_MIME[base] ?? base.split("/")[1] ?? "bin"
}

/**
 * Sobe um base64 (com ou sem prefixo data:) pro bucket e devolve a URL
 * publica. `prefixo` organiza os arquivos (ex: 'out/<usuario>' ou 'in').
 * Retorna null se o storage estiver indisponivel ou o upload falhar.
 */
export async function uploadMidiaCrm(
  base64: string,
  mimetype: string | null,
  prefixo: string
): Promise<string | null> {
  const db = getSupabaseAdmin()
  if (!db) return null

  // Aceita "data:<mime>;base64,AAAA..." (inclusive com ;codecs=opus, que o
  // Chrome/Firefox põem no blob.type) ou o base64 puro. Corta pela PRIMEIRA
  // vírgula — um regex tipo /data:([^;]+);base64,/ quebraria no ';codecs='.
  let dados = base64
  let mime = mimetype
  if (base64.startsWith("data:")) {
    const virgula = base64.indexOf(",")
    if (virgula !== -1) {
      // header ex: "audio/webm;codecs=opus;base64" -> mime = antes do 1º ';'.
      const header = base64.slice(5, virgula)
      if (!mime) mime = header.split(";")[0].trim() || null
      dados = base64.slice(virgula + 1)
    }
  }

  let buffer: Buffer
  try {
    buffer = Buffer.from(dados, "base64")
  } catch {
    return null
  }
  if (buffer.length === 0) return null

  const caminho = `${prefixo.replace(/^\/|\/$/g, "")}/${randomUUID()}.${extDoMime(mime)}`
  const { error } = await db.storage.from(BUCKET).upload(caminho, buffer, {
    contentType: mime ?? "application/octet-stream",
    upsert: false,
  })
  if (error) {
    console.error("[crm-midia] falha no upload", error.message)
    return null
  }

  const { data } = db.storage.from(BUCKET).getPublicUrl(caminho)
  return data?.publicUrl ?? null
}
