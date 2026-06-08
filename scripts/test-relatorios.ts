/**
 * Teste dos builders de relatório WhatsApp. Roda os 3 relatórios × 3
 * períodos com dados REAIS (hoje) e printa no terminal — pra validar o
 * texto antes de submeter os templates à Meta.
 *
 * Pré-requisito: crie `.env.local` na raiz do projeto (gitignored) com:
 *   NEXT_PUBLIC_SUPABASE_URL=https://<projeto>.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY=<service_role_key>
 *
 * Rodar:  npx tsx scripts/test-relatorios.ts      (ou: npm run test:relatorios)
 */
import { config } from "dotenv"
// dotenv padrão carrega `.env`; o projeto usa `.env.local` (padrão Next).
// Carrega .env.local primeiro e .env como fallback (sem sobrescrever), ANTES
// de importar os builders (import dinâmico dentro de main) — garante a env
// disponível mesmo se algum módulo da cadeia leia process.env no topo.
config({ path: ".env.local" })
config()

import type {
  PeriodoRelatorio,
  RelatorioWhatsApp,
} from "../lib/whatsapp-builders"

const PERIODOS: PeriodoRelatorio[] = ["diario", "semanal", "mensal"]
const LIMITE_VAR = 700 // alerta de tamanho por variável (corpo Meta ~1024)

function inspecionar(nome: string, rel: RelatorioWhatsApp): boolean {
  console.log("\n" + "=".repeat(74))
  console.log(`▶ ${nome}  —  ${rel.variaveis.length} variáveis`)
  console.log("=".repeat(74))
  let ok = true
  rel.variaveis.forEach((v, i) => {
    const invalida = /[\r\n\t]/.test(v) || / {4,}/.test(v)
    if (invalida) ok = false
    const flags = [
      v.length > LIMITE_VAR ? `⚠️ ${v.length} chars` : `${v.length} chars`,
      invalida ? "❌ QUEBRA/TAB/4+ESPAÇOS" : "✓ linha única",
    ].join(" · ")
    console.log(`  {{${i + 1}}} [${flags}]  ${v}`)
  })
  console.log("\n--- textoCompleto ---\n" + rel.textoCompleto)
  return ok
}

async function main() {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    console.error(
      "❌ Faltam envs. Crie .env.local com NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY."
    )
    process.exit(1)
  }

  const { montarRelatorioComercial, montarRelatorioHub, montarRelatorioTrafego } =
    await import("../lib/whatsapp-builders")

  let tudoOk = true
  for (const p of PERIODOS) {
    tudoOk =
      inspecionar(`TRÁFEGO · ${p}`, await montarRelatorioTrafego(p)) && tudoOk
    tudoOk =
      inspecionar(`COMERCIAL · ${p}`, await montarRelatorioComercial(p)) && tudoOk
    tudoOk = inspecionar(`HUB · ${p}`, await montarRelatorioHub(p)) && tudoOk
  }

  console.log("\n" + "=".repeat(74))
  console.log(
    tudoOk
      ? "✅ Todas as variáveis são linha única (sem \\n/tab/4+ espaços)."
      : "❌ Há variável com quebra/tab/4+ espaços — corrigir antes de submeter."
  )
  console.log("Confira ainda: Tráfego=7 vars, Comercial=8, Hub=8.")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
