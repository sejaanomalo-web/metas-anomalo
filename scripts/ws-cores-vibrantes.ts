/**
 * Troca as cores dos contextos da paleta ANTIGA (dark-mode escurecido) pela
 * VIBRANTE (lib/workspace-cores.ts → MIGRACAO_CORES).
 *
 *   npx tsx scripts/ws-cores-vibrantes.ts            # mostra o que faria
 *   npx tsx scripts/ws-cores-vibrantes.ts --aplicar  # grava
 *
 * POR QUE EXISTE: a cor mora no banco (ws_contextos.cor). Trocar só a
 * constante do código deixaria os 35 contextos já importados com os hexes
 * escuros — o calendário continuaria opaco. Só mexe em cor que É exatamente
 * um hex da paleta antiga: cor escolhida à mão no color picker fica intacta.
 */

import { config } from "dotenv"
import { createClient } from "@supabase/supabase-js"
import { MIGRACAO_CORES } from "../lib/workspace-cores"

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

  const { data, error } = await db
    .from("ws_contextos")
    .select("id, nome, cor")
    .not("cor", "is", null)
  if (error) {
    console.error("Erro lendo ws_contextos:", error.message)
    process.exit(1)
  }

  let mudancas = 0
  for (const c of (data ?? []) as { id: string; nome: string; cor: string }[]) {
    const nova = MIGRACAO_CORES[c.cor.toLowerCase()]
    if (!nova) {
      console.log(`  = ${c.nome}: ${c.cor} (fora da paleta antiga, mantendo)`)
      continue
    }
    mudancas++
    console.log(`  → ${c.nome}: ${c.cor} → ${nova}`)
    if (aplicar) {
      const { error: e } = await db
        .from("ws_contextos")
        .update({ cor: nova })
        .eq("id", c.id)
      if (e) console.error(`    ERRO em ${c.nome}:`, e.message)
    }
  }

  console.log(
    aplicar
      ? `\n${mudancas} contexto(s) atualizados para a paleta vibrante.`
      : `\n${mudancas} contexto(s) mudariam. Rode com --aplicar para gravar.`
  )
}

main()
