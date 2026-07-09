import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase"
import { bearerValido } from "@/lib/cron-auth"
import { processarEventoWebhook } from "@/lib/crm-inbound"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
// Folga: o processamento faz chamadas sequenciais ao banco por mensagem.
export const maxDuration = 60

/**
 * Webhook UNICO da Evolution (CRM). Recebe inbound/status/conexao das 3
 * instancias e roteia por instance_name -> empresa (em lib/crm-inbound).
 *
 * Auth de MAQUINA (nao cookie): segredo no path, comparado em tempo constante
 * com EVOLUTION_WEBHOOK_SECRET (mesmo bearerValido dos crons). Segredo no path
 * porque nem toda build da Evolution permite header custom no webhook.
 *
 * Responde 200 SEMPRE que o segredo bater — mesmo em erro de processamento —
 * pra Evolution NAO reentregar em loop; o erro fica em
 * crm_wa_eventos.erro_processamento. So 401 quando o segredo nao bate.
 *
 * Configurar na Evolution (por instancia ou global) apontando pra:
 *   POST <APP_URL>/api/crm/wa/webhook/<EVOLUTION_WEBHOOK_SECRET>
 * com os eventos MESSAGES_UPSERT, CONNECTION_UPDATE, QRCODE_UPDATED
 * (+ futuramente MESSAGES_UPDATE, pra status de entrega/leitura).
 */
export async function POST(
  req: Request,
  { params }: { params: { segredo: string } }
) {
  if (
    !bearerValido(
      `Bearer ${params.segredo}`,
      process.env.EVOLUTION_WEBHOOK_SECRET
    )
  ) {
    return NextResponse.json({ erro: "nao_autorizado" }, { status: 401 })
  }

  const db = getSupabaseAdmin()
  if (!db) {
    console.error("[crm/webhook] service_role ausente")
    // 200 pra Evolution nao reentregar em loop (misconfig de env, raro).
    return NextResponse.json({ ok: false, erro: "service_role_ausente" })
  }

  let payload: any = null
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ ok: false, erro: "payload_invalido" })
  }

  // Log cru (auditoria + replay + 2a linha de idempotencia).
  let eventoId: string | null = null
  try {
    const { data } = await db
      .from("crm_wa_eventos")
      .insert({
        instance_name: payload?.instance ?? null,
        evento: payload?.event ?? null,
        wa_message_id: payload?.data?.key?.id ?? null,
        payload,
      })
      .select("id")
      .single()
    eventoId = (data?.id as string) ?? null
  } catch (e) {
    console.error("[crm/webhook] falha ao logar evento cru", e)
  }

  try {
    const r = await processarEventoWebhook(payload)
    if (eventoId) {
      await db
        .from("crm_wa_eventos")
        .update({
          processado: true,
          erro_processamento: r.ok ? null : r.erro ?? null,
        })
        .eq("id", eventoId)
    }
    return NextResponse.json({ ok: true, info: r.info ?? null })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[crm/webhook] erro ao processar", msg)
    if (eventoId) {
      await db
        .from("crm_wa_eventos")
        .update({ processado: false, erro_processamento: msg })
        .eq("id", eventoId)
    }
    // 200 mesmo em erro: evita loop de reentrega. O texto cru do erro fica em
    // crm_wa_eventos.erro_processamento (a resposta NAO ecoa conteudo do payload).
    return NextResponse.json({ ok: false, erro: "erro_processamento" })
  }
}
