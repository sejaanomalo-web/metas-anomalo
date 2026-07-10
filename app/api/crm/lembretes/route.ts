import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { getSupabaseAdmin } from "@/lib/supabase"
import { bearerValido } from "@/lib/cron-auth"
import { criarNotificacao } from "@/lib/notificacoes"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * Cron diário de lembretes do CRM (follow-ups marcados no calendário).
 *
 * Frequência: 1x/dia (plano Hobby da Vercel só permite cron diário — se o
 * projeto estiver no Pro, dá pra apertar o schedule em vercel.json pra algo
 * tipo a cada 15-30min sem mudar nada aqui). Pega tudo com
 * `lembrete_em <= agora` (não só "= hoje", pra pegar atrasados se um dia o
 * cron falhar) e ainda não notificado.
 *
 * Cada lembrete é PESSOAL (isolamento por usuário do CRM) — notifica só o
 * DONO do lead via `usuarioIds`, nunca um papel inteiro.
 */
async function executar() {
  const authHeader = headers().get("authorization")
  if (!bearerValido(authHeader, process.env.CRON_SECRET)) {
    return NextResponse.json({ erro: "nao_autorizado" }, { status: 401 })
  }

  const db = getSupabaseAdmin()
  if (!db) {
    return NextResponse.json({ erro: "service_role_ausente" }, { status: 500 })
  }

  const agora = new Date().toISOString()
  const { data: pendentes, error } = await db
    .from("crm_atividades")
    .select(
      "id, lead_id, usuario_id, titulo, lead:crm_leads(nome, telefone_e164, empresa_nome)"
    )
    .not("lembrete_em", "is", null)
    .lte("lembrete_em", agora)
    .is("concluido_em", null)
    .is("notificado_em", null)
    .limit(200)

  if (error) {
    console.error("[crm/lembretes] erro ao ler atividades", error.message)
    return NextResponse.json({ erro: "leitura_falhou" }, { status: 500 })
  }

  let notificados = 0
  let semDono = 0

  for (const a of pendentes ?? []) {
    if (!a.usuario_id) {
      // Nao deveria acontecer (usuario_id e preenchido na criacao do
      // follow-up) — carimba pra nao ficar reprocessando pra sempre, mas
      // loga pra investigar se aparecer.
      console.error(`[crm/lembretes] atividade ${a.id} sem usuario_id`)
      await db.from("crm_atividades").update({ notificado_em: agora }).eq("id", a.id)
      semDono++
      continue
    }

    const lead = Array.isArray(a.lead) ? a.lead[0] : a.lead
    const nomeLead = (lead?.nome as string) ?? (lead?.telefone_e164 as string) ?? "um lead"
    const empresa = (lead?.empresa_nome as string) ?? null
    const titulo = (a.titulo as string) ?? null

    await criarNotificacao({
      tipo: "crm_lembrete",
      empresa,
      titulo: `Follow-up · ${nomeLead}`,
      mensagem: titulo
        ? `${titulo} — ${nomeLead}`
        : `Follow-up marcado com ${nomeLead} pra hoje.`,
      payload: { lead_id: a.lead_id, atividade_id: a.id },
      usuarioIds: [a.usuario_id as string],
    })

    await db
      .from("crm_atividades")
      .update({ notificado_em: agora })
      .eq("id", a.id)
    notificados++
  }

  return NextResponse.json({
    ok: true,
    pendentes: (pendentes ?? []).length,
    notificados,
    sem_dono: semDono,
  })
}

export async function GET() {
  return executar()
}

export async function POST() {
  return executar()
}
