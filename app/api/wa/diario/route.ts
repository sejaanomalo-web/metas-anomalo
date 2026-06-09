import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { getSupabaseAdmin } from "@/lib/supabase"
import { enviarTemplate } from "@/lib/whatsapp"
import {
  montarRelatorioTrafego,
  montarRelatorioComercial,
  montarRelatorioHub,
  type RelatorioWhatsApp,
} from "@/lib/whatsapp-builders"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
// Folga de tempo: ha sleeps entre os envios pra nao bater rate limit.
export const maxDuration = 60

/**
 * Cron diario dos relatorios WhatsApp (21h BRT).
 *
 * Horario: o agendamento em vercel.json e "0 0 * * *" (00:00 UTC). Como BRT e
 * UTC-3, 00:00 UTC = 21:00 BRT. (vercel.json e JSON estrito e nao aceita
 * comentario, por isso a conta fica documentada aqui.)
 *
 * Fluxo:
 *   1. Valida o Bearer CRON_SECRET (mesmo padrao do /api/financeiro/materializar).
 *   2. Le whatsapp_assinaturas (ativo = true) com a service_role.
 *   3. Idempotencia: pula quem ja recebeu hoje (compara enviada_em em BRT).
 *   4. Monta cada relatorio UMA vez (o conteudo e igual pra todos os assinantes).
 *   5. Dispara conforme as flags, espacando os envios; carimba enviada_em.
 *
 * Vercel Cron dispara via GET; o teste manual pode usar POST. Ambos exigem o
 * Bearer e rodam a mesma rotina (executar).
 */

// Nomes dos templates aprovados na Meta (precisam existir e estar aprovados).
const TEMPLATE_TRAFEGO = "relatorio_trafego"
const TEMPLATE_COMERCIAL = "relatorio_comercial"
const TEMPLATE_HUB = "relatorio_hub"

// Espacamento entre envios consecutivos pra nao bater rate limit da Cloud API.
const MS_ENTRE_ENVIOS = 1500

interface Assinante {
  id: string
  telefone_e164: string
  recebe_trafego: boolean
  recebe_comercial: boolean
  recebe_hub: boolean
  enviada_em: string | null
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Data-calendario em BRT (UTC-3) no formato YYYY-MM-DD.
function dataBRT(ref: Date): string {
  const brt = new Date(ref.getTime() - 3 * 60 * 60 * 1000)
  return brt.toISOString().slice(0, 10)
}

// Mascara o telefone na resposta/log (mantem so DDI e ultimos 4 digitos).
function mascarar(tel: string): string {
  if (tel.length <= 6) return tel
  return `${tel.slice(0, 2)}****${tel.slice(-4)}`
}

// Monta um relatorio sem deixar um erro de banco derrubar o cron inteiro.
async function montarSeguro(
  fn: () => Promise<RelatorioWhatsApp>,
  nome: string
): Promise<RelatorioWhatsApp | null> {
  try {
    return await fn()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error(`[wa/diario] falha ao montar relatorio ${nome}: ${msg}`)
    return null
  }
}

async function executar() {
  // 1) Auth: mesmo padrao do materializar (Bearer CRON_SECRET).
  const authHeader = headers().get("authorization")
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ erro: "nao_autorizado" }, { status: 401 })
  }

  const db = getSupabaseAdmin()
  if (!db) {
    return NextResponse.json({ erro: "service_role_ausente" }, { status: 500 })
  }

  // 2) Assinantes ativos.
  const { data: assinantesRaw, error } = await db
    .from("whatsapp_assinaturas")
    .select(
      "id, telefone_e164, recebe_trafego, recebe_comercial, recebe_hub, enviada_em"
    )
    .eq("ativo", true)

  if (error) {
    console.error(`[wa/diario] erro ao ler assinaturas: ${error.message}`)
    return NextResponse.json({ erro: "leitura_falhou" }, { status: 500 })
  }

  const assinantes = (assinantesRaw ?? []) as Assinante[]
  const hoje = dataBRT(new Date())

  // 3) Idempotencia: pula quem ja recebeu hoje (BRT).
  const pendentes = assinantes.filter(
    (a) => !(a.enviada_em && dataBRT(new Date(a.enviada_em)) === hoje)
  )

  if (pendentes.length === 0) {
    return NextResponse.json({
      ok: true,
      data: hoje,
      assinantes_ativos: assinantes.length,
      pendentes: 0,
      enviados: 0,
      falhas: 0,
      info: "Todos os assinantes ativos ja receberam hoje.",
    })
  }

  // 4) Monta cada relatorio UMA vez (conteudo e igual pra todo mundo). So
  //    monta o que ao menos um pendente quer receber.
  const precisaTrafego = pendentes.some((a) => a.recebe_trafego)
  const precisaComercial = pendentes.some((a) => a.recebe_comercial)
  const precisaHub = pendentes.some((a) => a.recebe_hub)

  const [relTrafego, relComercial, relHub] = await Promise.all([
    precisaTrafego
      ? montarSeguro(() => montarRelatorioTrafego("diario"), "trafego")
      : Promise.resolve(null),
    precisaComercial
      ? montarSeguro(() => montarRelatorioComercial("diario"), "comercial")
      : Promise.resolve(null),
    precisaHub
      ? montarSeguro(() => montarRelatorioHub("diario"), "hub")
      : Promise.resolve(null),
  ])

  // 5) Dispara, espacando os envios. Carimba enviada_em quando ao menos um
  //    relatorio sai com sucesso; se tudo falhar, deixa pra proxima rodada.
  let enviados = 0
  let falhas = 0
  let jaEnviouAlgum = false
  const detalhes: {
    telefone: string
    enviados: string[]
    falhas: string[]
  }[] = []

  for (const a of pendentes) {
    const fila: { template: string; rel: RelatorioWhatsApp | null }[] = []
    if (a.recebe_trafego)
      fila.push({ template: TEMPLATE_TRAFEGO, rel: relTrafego })
    if (a.recebe_comercial)
      fila.push({ template: TEMPLATE_COMERCIAL, rel: relComercial })
    if (a.recebe_hub) fila.push({ template: TEMPLATE_HUB, rel: relHub })

    const okList: string[] = []
    const falhaList: string[] = []

    for (const item of fila) {
      if (!item.rel) {
        // Relatorio nao pode ser montado (erro de banco). Conta como falha.
        falhaList.push(item.template)
        falhas++
        continue
      }
      // Espaca cada envio do anterior (sem sleep no primeiro nem no final).
      if (jaEnviouAlgum) await dormir(MS_ENTRE_ENVIOS)
      const r = await enviarTemplate(a.telefone_e164, item.template, item.rel.variaveis)
      jaEnviouAlgum = true
      if (r.ok) {
        okList.push(item.template)
        enviados++
      } else {
        falhaList.push(item.template)
        falhas++
      }
    }

    // Carimba so se a pessoa recebeu ao menos um relatorio hoje.
    if (okList.length > 0) {
      const agora = new Date().toISOString()
      const { error: upErr } = await db
        .from("whatsapp_assinaturas")
        .update({ enviada_em: agora, updated_at: agora })
        .eq("id", a.id)
      if (upErr) {
        console.error(
          `[wa/diario] falha ao carimbar enviada_em de ${a.id}: ${upErr.message}`
        )
      }
    }

    detalhes.push({
      telefone: mascarar(a.telefone_e164),
      enviados: okList,
      falhas: falhaList,
    })
  }

  return NextResponse.json({
    ok: true,
    data: hoje,
    assinantes_ativos: assinantes.length,
    pendentes: pendentes.length,
    enviados,
    falhas,
    detalhes,
  })
}

export async function GET() {
  return executar()
}

export async function POST() {
  return executar()
}
