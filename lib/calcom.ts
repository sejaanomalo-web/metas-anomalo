// =============================================================================
// Cal.com API v2 — cliente mínimo, SÓ servidor.
// =============================================================================
//
// Auth: `Authorization: Bearer <API key da conta>` (chave cal_live_… gerada em
// app.cal.com → Settings → Developer → API Keys, logado naquela conta). Toda
// função recebe a `conta` (chave em reunioes_integracoes) como 1º argumento.
// A chave mora só em variável de ambiente — nunca no banco, nunca no browser,
// nunca inteira em log.
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

// ============================================================
// Contas — cada conta do Cal.com tem a SUA API key, em variável de ambiente.
// ============================================================
//
// A conta é identificada pela `chave` de reunioes_integracoes:
//   'principal' → CALCOM_API_KEY          (Anômalo Hub — a conta original)
//   'ativo'     → CALCOM_API_KEY_ATIVO    (sistema Ativo)
//   'xyz'       → CALCOM_API_KEY_XYZ      (próximas, sem mudar código)
// O segredo do webhook segue a mesma regra (CALCOM_WEBHOOK_SECRET_ATIVO) e,
// se a conta não tiver um próprio, usa o CALCOM_WEBHOOK_SECRET comum.

export const CONTA_PRINCIPAL = "principal"

function sufixo(conta: string): string {
  return conta === CONTA_PRINCIPAL ? "" : `_${conta.toUpperCase()}`
}

/** Nome da variável de ambiente da API key desta conta (pra tela dizer o que falta). */
export function nomeEnvApiKey(conta: string): string {
  return `CALCOM_API_KEY${sufixo(conta)}`
}

export function nomeEnvWebhookSecret(conta: string): string {
  return `CALCOM_WEBHOOK_SECRET${sufixo(conta)}`
}

function apiKeyDe(conta: string): string | undefined {
  return process.env[nomeEnvApiKey(conta)] || undefined
}

/** Segredo do webhook da conta: o próprio, ou o comum. */
export function segredoWebhookDe(conta: string): string | undefined {
  return process.env[nomeEnvWebhookSecret(conta)] || process.env.CALCOM_WEBHOOK_SECRET || undefined
}

export function calcomConfigurado(conta: string = CONTA_PRINCIPAL): boolean {
  return Boolean(apiKeyDe(conta))
}

export function webhookSecretConfigurado(conta: string = CONTA_PRINCIPAL): boolean {
  return Boolean(segredoWebhookDe(conta))
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
  conta: string,
  metodo: "GET" | "POST" | "PATCH" | "DELETE",
  caminho: string,
  opts: { versao?: string; corpo?: unknown; query?: Record<string, string | undefined> } = {}
): Promise<T> {
  const chave = apiKeyDe(conta)
  if (!chave) throw new ErroCalcom(`${nomeEnvApiKey(conta)} não configurada.`, null, false)

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

export async function calMe(conta: string): Promise<CalMe> {
  return (await chamar<Envelope<CalMe>>(conta, "GET", "/v2/me")).data
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

export async function calListarEventTypes(conta: string, username?: string): Promise<CalEventType[]> {
  const r = await chamar<Envelope<CalEventType[]>>(conta, "GET", "/v2/event-types", {
    versao: VERSOES.eventTypes,
    query: { username },
  })
  return Array.isArray(r.data) ? r.data : []
}

export async function calCriarEventType(conta: string, corpo: Record<string, unknown>): Promise<CalEventType> {
  return (await chamar<Envelope<CalEventType>>(conta, "POST", "/v2/event-types", { versao: VERSOES.eventTypes, corpo })).data
}

export async function calAtualizarEventType(conta: string, id: number, corpo: Record<string, unknown>): Promise<CalEventType> {
  return (await chamar<Envelope<CalEventType>>(conta, "PATCH", `/v2/event-types/${id}`, { versao: VERSOES.eventTypes, corpo })).data
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

export async function calListarSchedules(conta: string): Promise<CalSchedule[]> {
  const r = await chamar<Envelope<CalSchedule[]>>(conta, "GET", "/v2/schedules", { versao: VERSOES.schedules })
  return Array.isArray(r.data) ? r.data : []
}

export async function calCriarSchedule(conta: string, corpo: Record<string, unknown>): Promise<CalSchedule> {
  return (await chamar<Envelope<CalSchedule>>(conta, "POST", "/v2/schedules", { versao: VERSOES.schedules, corpo })).data
}

export async function calAtualizarSchedule(conta: string, id: number, corpo: Record<string, unknown>): Promise<CalSchedule> {
  return (await chamar<Envelope<CalSchedule>>(conta, "PATCH", `/v2/schedules/${id}`, { versao: VERSOES.schedules, corpo })).data
}

// ============================================================
// Out of office (bloqueios de dias inteiros)
// ============================================================

export async function calCriarOoo(conta: string, corpo: { start: string; end: string; notes?: string; reason?: string }): Promise<{ id: number }> {
  return (await chamar<Envelope<{ id: number }>>(conta, "POST", "/v2/me/ooo", { corpo })).data
}

export async function calApagarOoo(conta: string, id: number): Promise<void> {
  await chamar(conta, "DELETE", `/v2/me/ooo/${id}`)
}

// ============================================================
// Bookings (reconciliação)
// ============================================================

export async function calListarBookings(conta: string, q: {
  status?: "upcoming" | "past" | "cancelled" | "unconfirmed"
  afterStart?: string
  beforeEnd?: string
  cursor?: string
}): Promise<{ data: unknown[]; nextCursor: string | null }> {
  const r = await chamar<{ data: unknown[]; pagination?: { nextCursor?: string | null } }>(conta, "GET", "/v2/bookings", {
    versao: VERSOES.bookings,
    query: { ...q, limit: "100", sortStart: "asc" },
  })
  return { data: Array.isArray(r.data) ? r.data : [], nextCursor: r.pagination?.nextCursor ?? null }
}

/** GET /v2/bookings/{uid} — estado real de UMA reserva. É o que confirma um
 *  cancelamento quando a resposta se perdeu, e o que a reconciliação usa pra
 *  não confundir "não veio na listagem" com "foi cancelada". */
export async function calBuscarBooking(conta: string, uid: string): Promise<unknown> {
  return (await chamar<Envelope<unknown>>(conta, "GET", `/v2/bookings/${encodeURIComponent(uid)}`, { versao: VERSOES.booking })).data
}

/** POST /v2/bookings/{uid}/cancel — cancela a reserva no Cal.com (que então
 *  libera o horário, apaga o evento do calendário conectado e avisa o
 *  participante). Não é o "decline" de reserva pendente. */
export async function calCancelarBooking(conta: string, uid: string, motivo: string | null): Promise<unknown> {
  const corpo: Record<string, unknown> = {}
  if (motivo) corpo.cancellationReason = motivo
  return (await chamar<Envelope<unknown>>(conta, "POST", `/v2/bookings/${encodeURIComponent(uid)}/cancel`, { versao: VERSOES.booking, corpo })).data
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

export async function calListarWebhooks(conta: string): Promise<CalWebhook[]> {
  const r = await chamar<Envelope<CalWebhook[]>>(conta, "GET", "/v2/webhooks")
  return Array.isArray(r.data) ? r.data : []
}

export async function calCriarWebhook(conta: string, corpo: {
  subscriberUrl: string
  triggers: string[]
  secret: string
  active: boolean
}): Promise<CalWebhook> {
  return (await chamar<Envelope<CalWebhook>>(conta, "POST", "/v2/webhooks", { corpo: { ...corpo, version: "2021-10-20" } })).data
}

export async function calAtualizarWebhook(conta: string, id: string, corpo: Record<string, unknown>): Promise<CalWebhook> {
  return (await chamar<Envelope<CalWebhook>>(conta, "PATCH", `/v2/webhooks/${encodeURIComponent(id)}`, { corpo })).data
}

export async function calApagarWebhook(conta: string, id: string): Promise<void> {
  await chamar(conta, "DELETE", `/v2/webhooks/${encodeURIComponent(id)}`)
}

// ============================================================
// Calendários e conferência (só leitura de status)
// ============================================================

export async function calSalvarFeedIcs(conta: string, url: string): Promise<{ id: number }> {
  return (await chamar<Envelope<{ id: number }>>(conta, "POST", "/v2/calendars/ics-feed/save", {
    corpo: { urls: [url], readOnly: true },
  })).data
}

export async function calListarCalendarios(conta: string): Promise<unknown> {
  return (await chamar<Envelope<unknown>>(conta, "GET", "/v2/calendars")).data
}

export async function calListarConferencias(conta: string): Promise<{ appSlug?: string; type?: string }[]> {
  const r = await chamar<Envelope<{ appSlug?: string; type?: string }[]>>(conta, "GET", "/v2/conferencing")
  return Array.isArray(r.data) ? r.data : []
}
