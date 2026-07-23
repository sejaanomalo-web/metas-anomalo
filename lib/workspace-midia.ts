// =============================================================================
// Workspace — upload de fotos de perfil (cliente e usuário). Server-only.
// =============================================================================
// Bucket PÚBLICO 'ws-perfil' (criado em 20260726_workspace_fase4.sql).
//
// NÃO usar 'ws-anexos': aquele bucket é privado de propósito (documento de
// cliente) e foi exatamente o bug das fotos quebradas — o upload dava certo,
// getPublicUrl devolvia uma URL, e a imagem respondia 400. Avatar precisa de
// URL estável e eterna; signed URL expira e quebraria a foto já gravada.
// Caminhos: perfil/contexto/<uuid>.<ext> e perfil/usuario/<uuid>.<ext> —
// públicos, mas não-adivinháveis.

import { randomUUID } from "crypto"
import { getSupabaseAdmin } from "./supabase"

export const BUCKET_PERFIL = "ws-perfil"
const MAX_BYTES = 3 * 1024 * 1024 // 3MB é MUITO para um avatar

const EXT_POR_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
}

/**
 * Sobe uma imagem base64 (data URL ou base64 puro) e devolve a URL pública.
 * null em qualquer falha — quem chama decide manter a foto anterior.
 */
export async function uploadFotoPerfil(
  base64: string,
  prefixo: "contexto" | "usuario"
): Promise<string | null> {
  const db = getSupabaseAdmin()
  if (!db) return null

  let dados = base64
  let mime: string | null = null
  if (base64.startsWith("data:")) {
    const virgula = base64.indexOf(",")
    if (virgula === -1) return null
    mime = base64.slice(5, virgula).split(";")[0].trim() || null
    dados = base64.slice(virgula + 1)
  }
  if (!mime || !(mime in EXT_POR_MIME)) return null

  let buffer: Buffer
  try {
    buffer = Buffer.from(dados, "base64")
  } catch {
    return null
  }
  if (buffer.length === 0 || buffer.length > MAX_BYTES) return null

  const caminho = `perfil/${prefixo}/${randomUUID()}.${EXT_POR_MIME[mime]}`
  const { error } = await db.storage.from(BUCKET_PERFIL).upload(caminho, buffer, {
    contentType: mime,
    upsert: false,
  })
  if (error) {
    console.error("[workspace-midia] falha no upload", error.message)
    return null
  }
  const { data } = db.storage.from(BUCKET_PERFIL).getPublicUrl(caminho)
  const url = data?.publicUrl ?? null
  if (!url) {
    console.error("[workspace-midia] bucket ws-perfil sem URL pública — a migração 20260726 foi aplicada?")
  }
  return url
}
