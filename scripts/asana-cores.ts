/**
 * Backfill das cores dos projetos do Asana → ws_contextos.cor.
 *
 *   npx tsx scripts/asana-cores.ts            # mostra o que faria
 *   npx tsx scripts/asana-cores.ts --aplicar  # grava
 *
 * POR QUE EXISTE: a primeira carga do Asana gravou cor=null em todos os
 * contextos — e o calendário no visual do Asana usa a cor do projeto como
 * FUNDO do cartão. O payload cru do projeto (ws_import_raw) já tem o campo
 * `color`; aqui só traduzimos pro hex da paleta (lib/workspace-cores) e
 * atualizamos por source_gid.
 *
 * Só preenche onde cor ainda é NULL — se alguém já escolheu uma cor na mão,
 * o script não sobrescreve.
 */

import { config } from "dotenv"
import { createClient } from "@supabase/supabase-js"
import { corDoAsana } from "../lib/workspace-cores"

config({ path: ".env.local" })

const aplicar = process.argv.includes("--aplicar")

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error("Faltam NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no .env.local")
    process.exit(1)
  }
  const db = createClient(url, key, { auth: { persistSession: false } })

  // Última cor conhecida de cada projeto no raw (pode haver mais de uma
  // execução de importação — a mais recente vence).
  const { data: raw, error: e1 } = await db
    .from("ws_import_raw")
    .select("source_gid, payload, created_at")
    .eq("tipo_objeto", "project")
    .order("created_at", { ascending: true })
  if (e1) {
    console.error("Erro lendo ws_import_raw:", e1.message)
    process.exit(1)
  }

  const corPorGid = new Map<string, string | null>()
  for (const r of (raw ?? []) as { source_gid: string; payload: { color?: string | null } }[]) {
    corPorGid.set(r.source_gid, corDoAsana(r.payload?.color))
  }

  const { data: ctxs, error: e2 } = await db
    .from("ws_contextos")
    .select("id, nome, cor, source_gid")
    .not("source_gid", "is", null)
  if (e2) {
    console.error("Erro lendo ws_contextos:", e2.message)
    process.exit(1)
  }

  let mudancas = 0
  for (const c of (ctxs ?? []) as { id: string; nome: string; cor: string | null; source_gid: string }[]) {
    const nova = corPorGid.get(c.source_gid) ?? null
    if (!nova) continue
    if (c.cor) {
      console.log(`  = ${c.nome}: já tem cor ${c.cor}, mantendo`)
      continue
    }
    mudancas++
    console.log(`  → ${c.nome}: ${nova}`)
    if (aplicar) {
      const { error } = await db.from("ws_contextos").update({ cor: nova }).eq("id", c.id)
      if (error) console.error(`    ERRO em ${c.nome}:`, error.message)
    }
  }

  console.log(
    aplicar
      ? `\n${mudancas} contexto(s) atualizados.`
      : `\n${mudancas} contexto(s) receberiam cor. Rode com --aplicar para gravar.`
  )
}

main()
