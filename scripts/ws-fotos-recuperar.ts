/**
 * Recupera as fotos de perfil que ficaram quebradas (HTTP 400).
 *
 *   npx tsx scripts/ws-fotos-recuperar.ts            # mostra o que faria
 *   npx tsx scripts/ws-fotos-recuperar.ts --aplicar  # move e corrige as URLs
 *
 * POR QUE EXISTE: as primeiras fotos foram gravadas no bucket 'ws-anexos',
 * que é PRIVADO — a URL pública salva no banco responde 400 e o avatar vira
 * ícone de imagem quebrada. O arquivo em si está lá, íntegro. Este script
 * baixa cada um pelo service_role, sobe no bucket público 'ws-perfil' e
 * reescreve a URL em ws_contextos.foto_url / ws_preferencias.foto_url.
 *
 * Rodar DEPOIS de aplicar 20260726_workspace_fase4.sql (que cria o bucket).
 * Foto que já esteja no bucket novo é ignorada — pode rodar de novo à vontade.
 */

import { config } from "dotenv"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

config({ path: ".env.local" })

const aplicar = process.argv.includes("--aplicar")
const BUCKET_ANTIGO = "ws-anexos"
const BUCKET_NOVO = "ws-perfil"

/** Extrai o caminho dentro do bucket a partir da URL pública salva. */
function caminhoDe(url: string, bucket: string): string | null {
  const marca = `/storage/v1/object/public/${bucket}/`
  const i = url.indexOf(marca)
  if (i === -1) return null
  return decodeURIComponent(url.slice(i + marca.length))
}

async function mover(
  db: SupabaseClient,
  url: string
): Promise<{ nova: string | null; motivo: string }> {
  if (url.includes(`/${BUCKET_NOVO}/`)) return { nova: null, motivo: "já está no bucket novo" }
  const caminho = caminhoDe(url, BUCKET_ANTIGO)
  if (!caminho) return { nova: null, motivo: "URL fora do padrão — deixando como está" }

  const { data: arquivo, error: errDown } = await db.storage
    .from(BUCKET_ANTIGO)
    .download(caminho)
  if (errDown || !arquivo) {
    return { nova: null, motivo: `arquivo não encontrado (${errDown?.message ?? "vazio"})` }
  }
  if (!aplicar) return { nova: "(seria movido)", motivo: "ok" }

  const buffer = Buffer.from(await arquivo.arrayBuffer())
  const { error: errUp } = await db.storage.from(BUCKET_NOVO).upload(caminho, buffer, {
    contentType: arquivo.type || "image/jpeg",
    upsert: true,
  })
  if (errUp) return { nova: null, motivo: `falha no upload: ${errUp.message}` }

  const { data } = db.storage.from(BUCKET_NOVO).getPublicUrl(caminho)
  return { nova: data?.publicUrl ?? null, motivo: "ok" }
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error("Faltam NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no .env.local")
    process.exit(1)
  }
  const db = createClient(url, key, { auth: { persistSession: false } })

  const { data: buckets } = await db.storage.listBuckets()
  const novo = buckets?.find((b) => b.id === BUCKET_NOVO)
  if (!novo) {
    console.error(`Bucket '${BUCKET_NOVO}' não existe. Aplique 20260726_workspace_fase4.sql antes.`)
    process.exit(1)
  }
  if (!novo.public) {
    console.error(`Bucket '${BUCKET_NOVO}' existe mas NÃO é público — as fotos continuariam quebradas.`)
    process.exit(1)
  }

  let corrigidas = 0

  // ---------- clientes / empresas ----------
  const { data: ctxs } = await db
    .from("ws_contextos")
    .select("id, nome, foto_url")
    .not("foto_url", "is", null)
  for (const c of (ctxs ?? []) as { id: string; nome: string; foto_url: string }[]) {
    const { nova, motivo } = await mover(db, c.foto_url)
    if (!nova) {
      console.log(`  = ${c.nome}: ${motivo}`)
      continue
    }
    corrigidas++
    console.log(`  → ${c.nome}: ${motivo === "ok" ? "movida" : motivo}`)
    if (aplicar) {
      const { error } = await db.from("ws_contextos").update({ foto_url: nova }).eq("id", c.id)
      if (error) console.error(`    ERRO em ${c.nome}:`, error.message)
    }
  }

  // ---------- usuários ----------
  const { data: prefs } = await db
    .from("ws_preferencias")
    .select("usuario_id, foto_url")
    .not("foto_url", "is", null)
  for (const p of (prefs ?? []) as { usuario_id: string; foto_url: string }[]) {
    const { nova, motivo } = await mover(db, p.foto_url)
    if (!nova) {
      console.log(`  = usuário ${p.usuario_id.slice(0, 8)}: ${motivo}`)
      continue
    }
    corrigidas++
    console.log(`  → usuário ${p.usuario_id.slice(0, 8)}: movida`)
    if (aplicar) {
      const { error } = await db
        .from("ws_preferencias")
        .update({ foto_url: nova })
        .eq("usuario_id", p.usuario_id)
      if (error) console.error("    ERRO:", error.message)
    }
  }

  console.log(
    aplicar
      ? `\n${corrigidas} foto(s) recuperadas.`
      : `\n${corrigidas} foto(s) seriam recuperadas. Rode com --aplicar.`
  )
}

main()
