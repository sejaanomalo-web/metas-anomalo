import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase"
import { receberWebhook } from "@/lib/reunioes-sync"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * Webhook do Cal.com → tarefa no Workspace.
 *
 * Registrado automaticamente pelo botão "Conectar" da aba Reuniões
 * (POST /v2/webhooks), ou à mão em app.cal.com → Settings → Developer →
 * Webhooks, com:
 *   Subscriber URL: <URL do app>/api/reunioes/calcom/webhook
 *   Secret:         o mesmo valor de CALCOM_WEBHOOK_SECRET
 *
 * O Cal.com assina o CORPO com o secret e manda em `x-cal-signature-256`. Por
 * isso o corpo é lido como TEXTO CRU — reserializar o JSON quebraria o HMAC.
 * Sem assinatura válida: 401 e nada é gravado. A lógica inteira (idempotência,
 * retentativa, ordem dos eventos) está em lib/reunioes-sync.ts.
 */
export async function POST(req: Request) {
  let corpoCru: string
  try {
    corpoCru = await req.text()
  } catch {
    return NextResponse.json({ erro: "corpo_ilegivel" }, { status: 400 })
  }
  if (corpoCru.length > 512_000) {
    return NextResponse.json({ erro: "corpo_grande_demais" }, { status: 413 })
  }

  const db = getSupabaseAdmin()
  if (!db) {
    console.error("[reunioes/webhook] service_role ausente")
    return NextResponse.json({ ok: false, erro: "service_role_ausente" }, { status: 500 })
  }

  const r = await receberWebhook(db, corpoCru, req.headers.get("x-cal-signature-256"))
  // A resposta nunca ecoa o payload — tem dado pessoal.
  return NextResponse.json(r.corpo, { status: r.http })
}
