import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Feed ICS (webcal) do calendário de follow-ups do CRM — assinável direto
 * no Apple Calendar / Google Calendar / Outlook via "Adicionar calendário
 * por URL". Auth: token opaco no PATH (não header — apps de calendário não
 * mandam header custom), gerado por gerarLinkCalendarioAction e guardado em
 * usuarios.crm_calendario_token. O token funciona como uma senha: quem tiver
 * o link vê nome+telefone dos leads com follow-up marcado — usuário optou
 * conscientemente por esse trade-off (simplicidade de sync real via
 * assinatura, em vez de OAuth completo do Google/Apple).
 *
 * Sync é "de leitura" (uma via): o app de calendário PUXA este feed
 * periodicamente (intervalo controlado pelo próprio app, tipicamente de
 * hora em hora) — não é bidirecional.
 */

function icsEscape(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n")
}

function icsDate(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z"
}

export async function GET(
  _req: Request,
  { params }: { params: { token: string } }
) {
  const db = getSupabaseAdmin()
  if (!db) return new NextResponse("service_role_ausente", { status: 500 })

  const token = params.token
  if (!token) return new NextResponse("nao_autorizado", { status: 401 })

  const { data: usuario } = await db
    .from("usuarios")
    .select("id, nome")
    .eq("crm_calendario_token", token)
    .eq("ativo", true)
    .maybeSingle()
  if (!usuario) return new NextResponse("nao_autorizado", { status: 401 })

  const { data: atividades } = await db
    .from("crm_atividades")
    .select(
      "id, titulo, corpo, agendado_para, agendado_fim, lead:crm_leads(nome, telefone_e164, empresa_nome)"
    )
    .eq("usuario_id", usuario.id)
    .not("agendado_para", "is", null)
    .order("agendado_para", { ascending: true })
    .limit(500)

  const agora = icsDate(new Date().toISOString())
  const linhas: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Anomalo CRM//PT-BR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Anomalo CRM · Follow-ups",
  ]

  for (const a of atividades ?? []) {
    const lead = Array.isArray(a.lead) ? a.lead[0] : a.lead
    const resumoBase = (a.titulo as string) || "Follow-up"
    const resumo = lead?.nome ? `${resumoBase} · ${lead.nome}` : resumoBase
    const inicioIso = a.agendado_para as string
    const fimIso =
      (a.agendado_fim as string | null) ??
      new Date(new Date(inicioIso).getTime() + 30 * 60_000).toISOString()

    linhas.push(
      "BEGIN:VEVENT",
      `UID:crm-atividade-${a.id}@anomalo`,
      `DTSTAMP:${agora}`,
      `DTSTART:${icsDate(inicioIso)}`,
      `DTEND:${icsDate(fimIso)}`,
      `SUMMARY:${icsEscape(resumo)}`,
      a.corpo ? `DESCRIPTION:${icsEscape(a.corpo as string)}` : "",
      lead?.telefone_e164
        ? `LOCATION:${icsEscape(lead.telefone_e164 as string)}`
        : "",
      "END:VEVENT"
    )
  }
  linhas.push("END:VCALENDAR")

  const body = linhas.filter((l) => l !== "").join("\r\n")

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="anomalo-crm.ics"',
      "Cache-Control": "no-store",
    },
  })
}
