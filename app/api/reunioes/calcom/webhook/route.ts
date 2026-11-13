import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase"
import { chaveContaValida, receberWebhook } from "@/lib/reunioes-sync"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * Webhook do Cal.com → tarefa no Workspace.
 *
 * Registrado automaticamente pelo botão "Conectar" de cada conta na aba
 * Reuniões (POST /v2/webhooks), ou à mão em app.cal.com → Settings →
 * Developer → Webhooks, com:
 *   Subscriber URL: <URL do app>/api/reunioes/calcom/webhook            (conta principal)
 *                   <URL do app>/api/reunioes/calcom/webhook?conta=ativo (conta Ativo)
 *   Secret:         CALCOM_WEBHOOK_SECRET_<CONTA>, ou o CALCOM_WEBHOOK_SECRET comum
 *
 * `?conta=` diz qual conta mandou: é com o segredo DELA que a assinatura é
 * conferida, e é a ela que a reserva fica ligada (cancelar/conferir usam a
 * API key dessa conta).
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

  const conta = chaveContaValida(new URL(req.url).searchParams.get("conta"))
  const r = await receberWebhook(db, corpoCru, req.headers.get("x-cal-signature-256"), conta)
  // A resposta nunca ecoa o payload — tem dado pessoal.
  return NextResponse.json(r.corpo, { status: r.http })
}
