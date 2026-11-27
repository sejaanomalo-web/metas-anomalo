// Harness de navegador do Funil Estáticos Meta: serve o HTML REAL da página
// (mesmo renderizador, script e CSP da produção) com uma API SIMULADA em
// memória. Serve para testar a experiência (mobile, teclado, erros, 409,
// recarregar) e medir performance sem tocar no Supabase.
//   npx tsx scripts/qa/funil-estaticos-harness.ts   → http://localhost:4321/funil/estaticos-meta
import { createServer } from "node:http"
import { readFileSync } from "node:fs"
import { randomUUID } from "node:crypto"
import { cabecalhosSeguranca, paginaFunil } from "../../lib/funil-estaticos-pagina"
import type { DefinicaoFunil } from "../../lib/funil-estaticos-nucleo"

const raiz = new URL("../../", import.meta.url)
const sql = readFileSync(new URL("supabase/migrations/20261127_funil_estaticos_meta.sql", raiz), "utf8")
const def = JSON.parse(sql.split("$json$")[1]) as DefinicaoFunil
const PORTA = Number(process.env.PORTA ?? 4321)
const log: Record<string, unknown>[] = []
const sessoes = new Map<string, { lead: boolean; reserva: { inicio: string; fim: string } | null }>()
let conflitoUmaVez = process.env.SEM_CONFLITO !== "1"
const atraso = Number(process.env.ATRASO_MS ?? 250)

function slots() {
  const dias = []
  for (let i = 1; i <= 5; i++) {
    const d = new Date(Date.now() + i * 86400000).toISOString().slice(0, 10)
    dias.push({ date: d, slots: i === 2 ? [] : ["12:00", "13:00", "17:00"].map(h => {
      const start = new Date(`${d}T${h}:00.000Z`).toISOString()
      return { start, end: new Date(Date.parse(start) + 3600000).toISOString(), label: `${String(Number(h.slice(0, 2)) - 3).padStart(2, "0")}:00` }
    }) })
  }
  return { timezone: "America/Sao_Paulo", durationMinutes: 60, slotIntervalMinutes: 60, days: dias, tipoNome: "Diagnóstico comercial" }
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`)
  if (req.method === "GET" && url.pathname === "/funil/estaticos-meta") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", ...cabecalhosSeguranca() })
    return res.end(paginaFunil({ slug: "estaticos-meta", nome: "Funil Estáticos Meta", versaoId: "v1", def, api: "/api/public/funil",
      privacidadeUrl: "https://example.com/privacidade", consentimentoModo: "opt_in", pixelId: process.env.PIXEL ?? null,
      eventosMeta: { PageView: true, Lead: true, Schedule: true }, previa: null }))
  }
  if (req.method === "GET" && (url.pathname === "/funil/logo-anomalo-96.png" || url.pathname === "/favicon-32.png")) {
    res.writeHead(200, { "content-type": "image/png", "cache-control": "public, max-age=31536000, immutable" })
    return res.end(readFileSync(new URL(`public${url.pathname}`, raiz)))
  }
  if (req.method === "GET" && url.pathname === "/__log") { res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify(log)) }
  if (req.method === "POST" && url.pathname === "/api/public/funil") {
    let raw = ""; for await (const c of req) raw += c
    const b = JSON.parse(raw)
    log.push({ acao: b.acao, ...(b.acao === "eventos" ? { eventos: b.eventos.map((e: { evento: string; etapa?: string }) => `${e.evento}:${e.etapa ?? ""}`) } : {}), ...(b.acao === "contato" ? { respostas: b.respostas } : {}) })
    await new Promise(r => setTimeout(r, atraso))
    const json = (s: number, o: unknown) => { res.writeHead(s, { "content-type": "application/json", "cache-control": "no-store" }); res.end(JSON.stringify(o)) }
    if (b.acao === "sessao") {
      if (b.sessaoId && sessoes.has(b.sessaoId)) {
        const s = sessoes.get(b.sessaoId)!
        return json(200, { ok: true, sessaoId: b.sessaoId, versaoId: "v1", etapa: "p1", respostas: {}, lead: s.lead ? { primeiroNome: "João" } : null, reuniao: s.reserva, ambiente: "producao" })
      }
      const id = randomUUID(); sessoes.set(id, { lead: false, reserva: null })
      return json(200, { ok: true, sessaoId: id, segredo: "s".repeat(43), versaoId: "v1", etapa: "perfil", respostas: {}, lead: null, reuniao: null, ambiente: "producao" })
    }
    const s = sessoes.get(b.sessaoId)
    if (!s) return json(401, { ok: false, code: "SESSION_INVALID" })
    if (b.acao === "eventos" || b.acao === "despachar") return json(200, { ok: true })
    if (b.acao === "contato") {
      if (!/^\d{10,11}$/.test(String(b.whatsapp))) return json(400, { ok: false, code: "INVALID_INPUT", message: "Informe um WhatsApp válido com DDD." })
      s.lead = true
      return json(200, { ok: true, eventId: "lead.00000000-0000-4000-8000-000000000001", enviarPixel: true })
    }
    if (b.acao === "agenda") return json(200, { ok: true, ...slots() })
    if (b.acao === "reservar") {
      if (conflitoUmaVez) { conflitoUmaVez = false; return json(409, { ok: false, code: "SLOT_UNAVAILABLE" }) }
      s.reserva = { inicio: b.start, fim: new Date(Date.parse(b.start) + 3600000).toISOString() }
      return json(201, { ok: true, status: "reserved", bookingId: randomUUID(), startsAt: s.reserva.inicio, endsAt: s.reserva.fim, eventId: "schedule.x", enviarPixel: true })
    }
    return json(400, { ok: false })
  }
  res.writeHead(404); res.end()
}).listen(PORTA, () => console.log(`http://localhost:${PORTA}/funil/estaticos-meta`))
