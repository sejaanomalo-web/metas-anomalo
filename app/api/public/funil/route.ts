import { NextResponse } from "next/server"
import {
  abrirSessao, agendaDoFunil, capturarLead, carregarFunil, contextoCapi, despacharConversoes, ipDaRequisicao,
  lerSessao, lerTokenPrevia, limitarFunil, registrarEventos, reservarNoFunil, type FunilPublico,
} from "@/lib/funil-estaticos"
import { filtrarRespostas, validarEmailLead, validarInstagram, validarNomeLead, validarWhatsappLead } from "@/lib/funil-estaticos-nucleo"
import { dataBR } from "@/lib/reunioes-nucleo"
import { getSupabaseAdmin } from "@/lib/supabase"

// API pública do funil (sem login). Escopo mínimo: cada ação só enxerga a
// própria sessão (id + segredo). Nunca devolve dados de outros visitantes.
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const H = { "cache-control": "no-store" }
const json = (corpo: Record<string, unknown>, status = 200) => NextResponse.json(corpo, { status, headers: H })
const erro = (status: number, code: string, message: string) => json({ ok: false, code, message }, status)

function origemPermitida(req: Request): boolean {
  const origem = req.headers.get("origin")
  if (!origem) return true // sendBeacon/navegadores internos antigos podem omitir
  try { return new URL(origem).host === new URL(req.url).host || new URL(origem).host === req.headers.get("x-forwarded-host") } catch { return false }
}

export async function POST(req: Request) {
  if (!origemPermitida(req)) return erro(403, "FORBIDDEN", "Origem não permitida.")
  if (Number(req.headers.get("content-length") ?? 0) > 8192) return erro(413, "INVALID_INPUT", "Dados inválidos.")
  let body: Record<string, unknown>
  try {
    const raw = await req.text()
    if (raw.length > 8192) return erro(413, "INVALID_INPUT", "Dados inválidos.")
    body = JSON.parse(raw)
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error()
  } catch { return erro(400, "INVALID_INPUT", "Dados inválidos.") }

  const acao = body.acao
  const slug = typeof body.slug === "string" ? body.slug : ""
  let funil: FunilPublico | null = await carregarFunil(slug)
  if (!funil || funil.slug !== slug) return erro(404, "NOT_FOUND", "Formulário não encontrado.")
  let ambiente: "producao" | "teste" = "producao"
  let diagnosticoCapi = false
  if (typeof body.previa === "string") {
    const previa = lerTokenPrevia(funil.id, body.previa)
    if (!previa) return erro(403, "PREVIEW_INVALID", "Link de teste expirado.")
    funil = await carregarFunil(slug, { versaoId: previa.versaoId })
    if (!funil) return erro(404, "NOT_FOUND", "Versão não encontrada.")
    ambiente = "teste"
    diagnosticoCapi = previa.modo === "diagnostico_capi"
  } else if (!funil.ativo) return erro(503, "FUNNEL_INACTIVE", funil.definicao.textos.inativo)
  else if (acao === "sessao" && typeof body.versaoId === "string" && body.versaoId !== funil.versaoId && /^[0-9a-f-]{36}$/i.test(body.versaoId)) {
    // Página aberta antes de uma nova publicação: a sessão nasce na versão que
    // o visitante está vendo (só versões já publicadas; nunca rascunho).
    funil = (await carregarFunil(slug, { versaoId: body.versaoId, apenasPublicadas: true })) ?? funil
  }

  const ip = ipDaRequisicao(req)
  try {
    if (acao === "sessao") {
      const rate = await limitarFunil(`sessao:${ip}`, 40)
      if (rate === null) return erro(503, "TEMPORARY_FAILURE", "Tente novamente.")
      if (!rate) return erro(429, "RATE_LIMITED", "Tente novamente mais tarde.")
      const r = await abrirSessao(funil, req, body, ambiente, diagnosticoCapi)
      return r ? json({ ok: true, ...r }) : erro(503, "TEMPORARY_FAILURE", "Tente novamente.")
    }

    const s = await lerSessao(funil, body.sessaoId, body.segredo)
    if (!s) return erro(401, "SESSION_INVALID", "Sessão expirada. Recarregue a página.")
    if (s.ambiente !== ambiente) return erro(401, "SESSION_INVALID", "Sessão expirada. Recarregue a página.")
    // Cada sessão é interpretada pela versão em que começou (publicar não a quebra).
    if (s.versao_id !== funil.versaoId) {
      const daSessao = await carregarFunil(slug, { versaoId: s.versao_id })
      if (!daSessao) return erro(401, "SESSION_INVALID", "Sessão expirada. Recarregue a página.")
      funil = daSessao
    }

    if (acao === "eventos") {
      if (!Array.isArray(body.eventos)) return erro(400, "INVALID_INPUT", "Dados inválidos.")
      const rate = await limitarFunil(`eventos:${s.id}`, 100)
      if (rate === false) return erro(429, "RATE_LIMITED", "Muitos eventos.")
      return (await registrarEventos(funil, s, body.eventos)) ? json({ ok: true }) : erro(503, "TEMPORARY_FAILURE", "Tente novamente.")
    }

    if (acao === "contato") {
      // Honeypot: campo invisível que só robôs preenchem.
      if (typeof body.website === "string" && body.website.trim()) return erro(400, "INVALID_INPUT", "Confira os dados informados.")
      const nome = validarNomeLead(body.nome)
      const telefone = validarWhatsappLead(body.whatsapp)
      const email = validarEmailLead(body.email)
      const instagram = validarInstagram(body.instagram)
      const c = funil.definicao.contato
      if (!nome) return erro(400, "INVALID_INPUT", "Informe seu nome.")
      if (!telefone) return erro(400, "INVALID_INPUT", "Informe um WhatsApp válido com DDD.")
      if (email === false || (c.email === "obrigatorio" && !email)) return erro(400, "INVALID_INPUT", "Informe um e-mail válido.")
      if (instagram === false) return erro(400, "INVALID_INPUT", "Instagram inválido.")
      const [r1, r2] = await Promise.all([limitarFunil(`contato:${ip}`, 12), limitarFunil(`telefone:${telefone}`, 6)])
      if (r1 === null || r2 === null) return erro(503, "TEMPORARY_FAILURE", "Tente novamente.")
      if (!r1 || !r2) return erro(429, "RATE_LIMITED", "Tente novamente mais tarde.")
      const db = getSupabaseAdmin()!
      // Respostas também chegam aqui: não dependem do lote de eventos ter chegado antes.
      const respostas = { ...filtrarRespostas(funil.definicao, s.respostas), ...filtrarRespostas(funil.definicao, body.respostas) }
      const patch: Record<string, unknown> = { respostas }
      if (!s.fbp && typeof body.fbp === "string" && /^fb\.[0-9]\.[0-9]{10,16}\.[0-9A-Za-z_-]{1,40}$/.test(body.fbp)) { patch.fbp = body.fbp; s.fbp = body.fbp }
      if (!s.fbc && typeof body.fbc === "string" && /^fb\.[0-9]\.[0-9]{10,16}\.[A-Za-z0-9_-]{1,500}$/.test(body.fbc)) { patch.fbc = body.fbc; s.fbc = body.fbc }
      if (typeof body.consentimento === "boolean") patch.consentimento_marketing = body.consentimento
      await db.from("funil_sessoes").update(patch).eq("id", s.id)
      s.respostas = respostas
      const marketing = typeof body.consentimento === "boolean" ? body.consentimento : s.consentimento_marketing
      const r = await capturarLead(funil, s, {
        nome, telefone, email: email || null, instagram: (instagram || null) as string | null,
        consentimento: { marketing: marketing ?? null, aviso_versao: `privacidade:${funil.privacidadeUrl ?? "nenhuma"}` },
      }, contextoCapi(req, s, urlFonte(body.url, req, funil.slug)))
      if ("code" in r) {
        if (r.code === "ANSWERS_REQUIRED") return erro(400, "ANSWERS_REQUIRED", "Responda as perguntas.")
        if (r.code === "INVALID_INPUT") return erro(400, "INVALID_INPUT", "Confira os dados informados.")
        if (r.code === "SESSION_INVALID") return erro(401, "SESSION_INVALID", "Sessão expirada. Recarregue a página.")
        return erro(503, "TEMPORARY_FAILURE", "Tente novamente.")
      }
      return json({ ok: true, eventId: r.eventId, enviarPixel: r.enviarPixel })
    }

    if (acao === "agenda") {
      if (!s.lead_id) return erro(409, "LEAD_REQUIRED", "Informe seus dados antes.")
      const rate = await limitarFunil(`agenda:${ip}`, 60)
      if (rate === false) return erro(429, "RATE_LIMITED", "Tente novamente mais tarde.")
      const agenda = await agendaDoFunil(dataBR(new Date().toISOString()), 14)
      if (!agenda) return erro(503, "CONFIG_UNAVAILABLE", "Agenda indisponível.")
      const db = getSupabaseAdmin()!
      const { data: canal } = await db.from("reunioes_canais_nativos").select("reunioes_tipos(nome)").eq("chave", "estaticos_meta").maybeSingle()
      const tipoNome = (canal?.reunioes_tipos as unknown as { nome?: string } | null)?.nome ?? null
      return json({ ok: true, ...agenda, tipoNome })
    }

    if (acao === "reservar") {
      if (typeof body.start !== "string" || typeof body.idempotencyKey !== "string") return erro(400, "INVALID_INPUT", "Horário inválido.")
      const rate = await limitarFunil(`reservar:${ip}`, 15)
      if (rate === null) return erro(503, "TEMPORARY_FAILURE", "Tente novamente.")
      if (!rate) return erro(429, "RATE_LIMITED", "Tente novamente mais tarde.")
      const r = await reservarNoFunil(s, body.start, body.idempotencyKey, contextoCapi(req, s, urlFonte(body.url, req, funil.slug)), funil)
      if (r.code === "SLOT_UNAVAILABLE") return erro(409, "SLOT_UNAVAILABLE", "Esse horário não está mais disponível.")
      if (r.code === "IDEMPOTENCY_MISMATCH") return erro(409, "IDEMPOTENCY_MISMATCH", "Escolha o horário novamente.")
      if (r.code === "LEAD_REQUIRED") return erro(409, "LEAD_REQUIRED", "Informe seus dados antes.")
      if (r.code === "CONFIG_UNAVAILABLE") return erro(503, "CONFIG_UNAVAILABLE", "Agenda indisponível.")
      if (r.code === "INVALID_INPUT") return erro(400, "INVALID_INPUT", "Horário inválido.")
      if (r.code || !r.bookingId) return erro(503, "TEMPORARY_FAILURE", "Tente novamente.")
      // Sucesso só depois que reserva + tarefa foram gravadas (mesma transação).
      // Teste: status "simulated" (nenhuma reunião real foi criada).
      return json({ ok: true, status: r.status, bookingId: r.bookingId, startsAt: r.startsAt, endsAt: r.endsAt,
        eventId: r.eventId, enviarPixel: r.enviarPixel === true && r.status === "reserved" }, 201)
    }

    if (acao === "despachar") {
      // Disparo oportunista da fila CAPI desta sessão; a rotina periódica cobre falhas.
      const rate = await limitarFunil(`despachar:${s.id}`, 10)
      if (rate) await despacharConversoes({ sessaoId: s.id, limite: 3 })
      return json({ ok: true })
    }
    return erro(400, "INVALID_INPUT", "Ação inválida.")
  } catch {
    return erro(503, "TEMPORARY_FAILURE", "Tente novamente.")
  }
}

function urlFonte(v: unknown, req: Request, slug: string): string {
  const base = new URL(req.url).origin
  if (typeof v === "string") {
    try { const u = new URL(v); if (u.origin === base && u.pathname === `/funil/${slug}`) return `${u.origin}${u.pathname}` } catch { /* ignora */ }
  }
  // Sem query string: a URL do evento não leva UTMs nem nada do visitante.
  return `${base}/funil/${slug}`
}
