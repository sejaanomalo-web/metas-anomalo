// =============================================================================
// Cal.com API v2 — cliente mínimo, SÓ servidor.
// =============================================================================
//
// Auth: `Authorization: Bearer <CALCOM_API_KEY>` (chave cal_live_… gerada em
// app.cal.com → Settings → Developer → API Keys). A chave mora só em variável
// de ambiente — nunca no banco, nunca no browser, nunca inteira em log.
//
// Cada recurso da v2 exige o seu `cal-api-version` (sem ele o endpoint cai
// numa versão antiga). Valores conferidos na referência oficial em 2026-10-21:
//   event-types  → 2026-06-12      bookings (lista) → 2026-05-01
//   schedules    → 2024-06-11      booking (um)     → 2026-02-25
//   me, webhooks, ooo, calendars, conferencing → sem header de versão.

const VERSOES = {
  eventTypes: "2026-06-12",
  schedules: "2024-06-11",
  bookings: "2026-05-01",
  booking: "2026-02-25",
} as const

const TIMEOUT_MS = 15_000

export class ErroCalcom extends Error {
  constructor(
    message: string,
    readonly httpStatus: number | null,
    /** true = vale a pena tentar de novo (rede, 429, 5xx). */
    readonly transitorio: boolean
  ) {
    super(message)
    this.name = "ErroCalcom"
  }
}

export function calcomConfigurado(): boolean {
  return Boolean(process.env.CALCOM_API_KEY)
}

export function webhookSecretConfigurado(): boolean {
  return Boolean(process.env.CALCOM_WEBHOOK_SECRET)
}

function baseUrl(): string {
  // CALCOM_API_URL só existe pra quem usa Cal.com self-hosted; o padrão é a
  // nuvem oficial.
  return (process.env.CALCOM_API_URL || "https://api.cal.com").replace(/\/+$/, "")
}

/** Tira qualquer coisa parecida com chave de uma mensagem antes de logar. */
function semSegredo(s: string): string {
  return s.replace(/cal_(live_)?[A-Za-z0-9_-]{6,}/g, "cal_***").slice(0, 500)
}

async function chamar<T>(
  metodo: "GET" | "POST" | "PATCH" | "DELETE",
  caminho: string,
  opts: { versao?: string; corpo?: unknown; query?: Record<string, string | undefined> } = {}
): Promise<T> {
  const chave = process.env.CALCOM_API_KEY
  if (!chave) throw new ErroCalcom("CALCOM_API_KEY não configurada.", null, false)

  const url = new URL(baseUrl() + caminho)
  for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined) url.searchParams.set(k, v)

  const headers: Record<string, string> = { Authorization: `Bearer ${chave}` }
  if (opts.versao) headers["cal-api-version"] = opts.versao
  if (opts.corpo !== undefined) headers["content-type"] = "application/json"

  let resp: Response
  try {
    resp = await fetch(url, {
      method: metodo,
      headers,
      body: opts.corpo !== undefined ? JSON.stringify(opts.corpo) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    })
  } catch (e) {
    throw new ErroCalcom(`Falha de rede com o Cal.com: ${semSegredo(String(e))}`, null, true)
  }

  const texto = await resp.text()
  let json: unknown = null
  try {
    json = texto ? JSON.parse(texto) : null
  } catch {
    // corpo não-JSON: tratado abaixo pelo status
  }

  if (!resp.ok) {
    const msg = extrairMensagem(json) ?? texto.slice(0, 200)
    const dica =
      resp.status === 401 ? " (API key inválida ou revogada)" :
      resp.status === 403 ? " (sem permissão — recurso pode depender do plano)" :
      resp.status === 404 ? " (não encontrado)" : ""
    throw new ErroCalcom(
      `Cal.com ${metodo} ${caminho} → ${resp.status}${dica}: ${semSegredo(msg)}`,
      resp.status,
      resp.status === 429 || resp.status >= 500
    )
  }
  return json as T
}

function extrairMensagem(j: unknown): string | null {
  if (!j || typeof j !== "object") return null
  const o = j as Record<string, unknown>
  const err = o.error as Record<string, unknown> | undefined
  if (err && typeof err.message === "string") return err.message
  if (typeof o.message === "string") return o.message
  return null
}

interface Envelope<T> {
  status: "success" | "error"
  data: T
}

// ============================================================
// Me
// ============================================================

export interface CalMe {
  id: number
  username: string
  email: string
  name: string | null
  timeZone: string
}

export async function calMe(): Promise<CalMe> {
  return (await chamar<Envelope<CalMe>>("GET", "/v2/me")).data
}

// ============================================================
// Event types
// ============================================================

export interface CalEventType {
  id: number
  title: string
  slug: string
  lengthInMinutes: number
  description?: string | null
  scheduleId?: number | null
  hidden?: boolean
  bookingUrl?: string
  minimumBookingNotice?: number
  afterEventBuffer?: number
  locations?: { type?: string; integration?: string }[]
}

export async function calListarEventTypes(username?: string): Promise<CalEventType[]> {
  const r = await chamar<Envelope<CalEventType[]>>("GET", "/v2/event-types", {
    versao: VERSOES.eventTypes,
    query: { username },
  })
  return Array.isArray(r.data) ? r.data : []
}

export async function calCriarEventType(corpo: Record<string, unknown>): Promise<CalEventType> {
  return (await chamar<Envelope<CalEventType>>("POST", "/v2/event-types", { versao: VERSOES.eventTypes, corpo })).data
}

export async function calAtualizarEventType(id: number, corpo: Record<string, unknown>): Promise<CalEventType> {
  return (await chamar<Envelope<CalEventType>>("PATCH", `/v2/event-types/${id}`, { versao: VERSOES.eventTypes, corpo })).data
}

// ============================================================
// Schedules (disponibilidade)
// ============================================================

export interface CalSchedule {
  id: number
  name: string
  timeZone: string
  isDefault: boolean
  availability: { days: string[]; startTime: string; endTime: string }[]
  overrides: { date: string; startTime: string; endTime: string }[]
}

export async function calListarSchedules(): Promise<CalSchedule[]> {
  const r = await chamar<Envelope<CalSchedule[]>>("GET", "/v2/schedules", { versao: VERSOES.schedules })
  return Array.isArray(r.data) ? r.data : []
}

export async function calCriarSchedule(corpo: Record<string, unknown>): Promise<CalSchedule> {
  return (await chamar<Envelope<CalSchedule>>("POST", "/v2/schedules", { versao: VERSOES.schedules, corpo })).data
}

export async function calAtualizarSchedule(id: number, corpo: Record<string, unknown>): Promise<CalSchedule> {
  return (await chamar<Envelope<CalSchedule>>("PATCH", `/v2/schedules/${id}`, { versao: VERSOES.schedules, corpo })).data
}

// ============================================================
// Out of office (bloqueios de dias inteiros)
// ============================================================

export async function calCriarOoo(corpo: { start: string; end: string; notes?: string; reason?: string }): Promise<{ id: number }> {
  return (await chamar<Envelope<{ id: number }>>("POST", "/v2/me/ooo", { corpo })).data
}

export async function calApagarOoo(id: number): Promise<void> {
  await chamar("DELETE", `/v2/me/ooo/${id}`)
}

// ============================================================
// Bookings (reconciliação)
// ============================================================

export async function calListarBookings(q: {
  status?: "upcoming" | "past" | "cancelled" | "unconfirmed"
  afterStart?: string
  beforeEnd?: string
  cursor?: string
}): Promise<{ data: unknown[]; nextCursor: string | null }> {
  const r = await chamar<{ data: unknown[]; pagination?: { nextCursor?: string | null } }>("GET", "/v2/bookings", {
    versao: VERSOES.bookings,
    query: { ...q, limit: "100", sortStart: "asc" },
  })
  return { data: Array.isArray(r.data) ? r.data : [], nextCursor: r.pagination?.nextCursor ?? null }
}

// ============================================================
// Webhooks (do usuário)
// ============================================================

export interface CalWebhook {
  id: number | string
  subscriberUrl: string
  active: boolean
  triggers: string[]
}

export async function calListarWebhooks(): Promise<CalWebhook[]> {
  const r = await chamar<Envelope<CalWebhook[]>>("GET", "/v2/webhooks")
  return Array.isArray(r.data) ? r.data : []
}

export async function calCriarWebhook(corpo: {
  subscriberUrl: string
  triggers: string[]
  secret: string
  active: boolean
}): Promise<CalWebhook> {
  return (await chamar<Envelope<CalWebhook>>("POST", "/v2/webhooks", { corpo: { ...corpo, version: "2021-10-20" } })).data
}

export async function calAtualizarWebhook(id: string, corpo: Record<string, unknown>): Promise<CalWebhook> {
  return (await chamar<Envelope<CalWebhook>>("PATCH", `/v2/webhooks/${encodeURIComponent(id)}`, { corpo })).data
}

export async function calApagarWebhook(id: string): Promise<void> {
  await chamar("DELETE", `/v2/webhooks/${encodeURIComponent(id)}`)
}

// ============================================================
// Calendários e conferência (só leitura de status)
// ============================================================

export async function calSalvarFeedIcs(url: string): Promise<{ id: number }> {
  return (await chamar<Envelope<{ id: number }>>("POST", "/v2/calendars/ics-feed/save", {
    corpo: { urls: [url], readOnly: true },
  })).data
}

export async function calListarCalendarios(): Promise<unknown> {
  return (await chamar<Envelope<unknown>>("GET", "/v2/calendars")).data
}

export async function calListarConferencias(): Promise<{ appSlug?: string; type?: string }[]> {
  const r = await chamar<Envelope<{ appSlug?: string; type?: string }[]>>("GET", "/v2/conferencing")
  return Array.isArray(r.data) ? r.data : []
}
