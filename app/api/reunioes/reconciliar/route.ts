import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { getSupabaseAdmin } from "@/lib/supabase"
import { bearerValido } from "@/lib/cron-auth"
import { criarNotificacao } from "@/lib/notificacoes"
import { reconciliar } from "@/lib/reunioes-sync"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

/**
 * Cron diário de RECONCILIAÇÃO das reuniões (vercel.json). Mesma ideia de
 * /api/leads/reconciliar: o webhook é tempo real mas não é garantido; aqui o
 * sistema pergunta ao Cal.com (GET /v2/bookings) o que existe e aplica pela
 * mesma máquina de estados — idempotente, rodar 2x não duplica nada. Também
 * reprocessa eventos de webhook que ficaram com erro.
 *
 * Falha persistente vira notificação pro admin (sino).
 */
async function executar() {
  if (!bearerValido(headers().get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ erro: "nao_autorizado" }, { status: 401 })
  }
  const db = getSupabaseAdmin()
  if (!db) return NextResponse.json({ erro: "service_role_ausente" }, { status: 500 })

  const r = await reconciliar(db)

  if (r.erros > 0) {
    await criarNotificacao({
      tipo: "ws_tarefa",
      titulo: "Reuniões: falha na sincronização com o Cal.com",
      mensagem: r.mensagem.slice(0, 300),
      payload: { url: "/dashboard/workspace/reunioes?secao=historico" },
      papelAlvo: ["admin"],
    })
  }
  return NextResponse.json(r)
}

export const GET = executar
export const POST = executar
