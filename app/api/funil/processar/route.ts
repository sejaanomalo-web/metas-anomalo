import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { bearerValido } from "@/lib/cron-auth"
import { processarFunil } from "@/lib/funil-estaticos"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

/**
 * Rotina do Funil Estáticos Meta (Bearer CRON_SECRET):
 *  - abandono por inatividade + tarefas de follow-up (RPC funil_processar_inatividade);
 *  - fila da Conversions API (retry com backoff, event_id estável);
 *  - leads ainda sem vínculo no CRM.
 * Idempotente. Roda pelo cron diário da Vercel (plano Hobby) e pode ser chamada
 * com mais frequência por pg_cron + pg_net (ver docs/FUNIL_ESTATICOS_META.md).
 */
async function executar() {
  if (!bearerValido(headers().get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ erro: "nao_autorizado" }, { status: 401 })
  }
  const r = await processarFunil()
  return NextResponse.json(r, { status: r.ok ? 200 : 500, headers: { "cache-control": "no-store" } })
}

export const GET = executar
export const POST = executar
