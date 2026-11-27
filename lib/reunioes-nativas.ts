import { createHash, timingSafeEqual } from "node:crypto"
import { getSupabaseAdmin } from "./supabase"
import { brParaUtcIso, dataBR, horaBR, type Janela, type PeriodoDisp, type ExcecaoDisp, type BloqueioDisp } from "./reunioes-nucleo"

export const FUSO_NATIVO = "America/Sao_Paulo"
const DIA_MS = 86_400_000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function idempotencyKeyValida(value: unknown): value is string {
  return typeof value === "string" && value.length === 36 && UUID.test(value)
}

type Config = {
  tipo: { id: string; duracao_min: number; antecedencia_min_horas: number; intervalo_min: number; limite_diario: number | null; horizonte_dias: number; responsavel_id: string | null; ativo: boolean }
  disp: { id: string; fuso: string; modo_nativo: boolean; calcom_schedule_id: number | null; responsavel_id: string | null; janelas: Janela[]; periodos: PeriodoDisp[]; excecoes: ExcecaoDisp[]; bloqueios: BloqueioDisp[] }
  responsavelId: string
}
type Ocupado = { inicio: string; fim: string; tipo_id?: string | null; provedor?: string; bufferMin?: number; bloqueia?: boolean }

function somarDia(d: string, n: number): string { return new Date(Date.parse(`${d}T00:00:00Z`) + n * DIA_MS).toISOString().slice(0, 10) }
function minutos(h: string): number { const [hh, mm] = h.split(":").map(Number); return hh * 60 + mm }
function hhmm(m: number): string { return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}` }
export function sobrepoe(a: { inicio: string; fim: string }, b: { inicio: string; fim: string }, bufferMin = 0): boolean {
  return Date.parse(a.inicio) < Date.parse(b.fim) + bufferMin * 60_000 && Date.parse(a.fim) + bufferMin * 60_000 > Date.parse(b.inicio)
}

export function slotsDoDia(c: Config, data: string, ocupados: Ocupado[], agora = new Date()): { start: string; end: string; label: string }[] {
  const hoje = dataBR(agora.toISOString())
  if (data < hoje || data >= somarDia(hoje, c.tipo.horizonte_dias)) return []
  const dia = new Date(`${data}T00:00:00Z`).getUTCDay()
  if (!c.disp || c.disp.fuso !== FUSO_NATIVO || c.disp.bloqueios.some(b => data >= b.de && data <= b.ate)) return []
  let janelas = c.disp.janelas
  const periodo = c.disp.periodos.find(p => data >= p.de && data <= p.ate)
  if (periodo) janelas = periodo.janelas
  const excecao = c.disp.excecoes.find(e => e.data === data)
  if (excecao) janelas = excecao.janelas.map(j => ({ ...j, dia }))
  const limite = c.tipo.limite_diario
  const reservasNoDia = ocupados.filter(o => o.tipo_id === c.tipo.id && dataBR(o.inicio) === data).length
  if (limite !== null && reservasNoDia >= limite) return []
  const out: { start: string; end: string; label: string }[] = []
  for (const janela of janelas.filter(j => j.dia === dia)) {
    for (let min = Math.ceil(minutos(janela.inicio) / 15) * 15; min + c.tipo.duracao_min <= minutos(janela.fim); min += 15) {
      const start = brParaUtcIso(data, hhmm(min))
      const end = new Date(Date.parse(start) + c.tipo.duracao_min * 60_000).toISOString()
      if (dataBR(end) !== data || Date.parse(start) < agora.getTime() + c.tipo.antecedencia_min_horas * 3_600_000) continue
      if (ocupados.some(o => o.bloqueia !== false && (
        o.provedor
          ? Date.parse(start) < Date.parse(o.fim) + Math.max(c.tipo.intervalo_min, o.bufferMin ?? 0) * 60_000 && Date.parse(end) + c.tipo.intervalo_min * 60_000 > Date.parse(o.inicio)
          : sobrepoe({ inicio: start, fim: end }, o)
      ))) continue
      out.push({ start, end, label: horaBR(start) })
    }
  }
  return out
}

export type ChaveCanalNativo = "ativo" | "estaticos_meta"

/** Canal ATIVO: exige também a feature flag do servidor (comportamento original). */
export async function configurarNativo(): Promise<Config | null> {
  if (process.env.ATIVO_NATIVE_BOOKING_ENABLED !== "true") return null
  return configurarCanal("ativo")
}

/** Lê tipo + agenda de um canal nativo ativo e com exclusividade verificada. */
export async function configurarCanal(chave: ChaveCanalNativo): Promise<Config | null> {
  const db = getSupabaseAdmin()
  if (!db) return null
  const versao = await db.rpc("reunioes_nativas_versao")
  if (versao.error || versao.data !== 2) return null
  const { data: canal, error } = await db.from("reunioes_canais_nativos")
    .select("tipo_id, disponibilidade_id, ativo, exclusividade_verificada_em").eq("chave", chave).maybeSingle()
  if (error || !canal?.ativo || !canal.exclusividade_verificada_em) return null
  const [t, d] = await Promise.all([
    db.from("reunioes_tipos").select("id, duracao_min, antecedencia_min_horas, intervalo_min, limite_diario, horizonte_dias, responsavel_id, ativo").eq("id", canal.tipo_id).maybeSingle(),
    db.from("reunioes_disponibilidades").select("id, fuso, modo_nativo, calcom_schedule_id, responsavel_id, janelas, periodos, excecoes, bloqueios").eq("id", canal.disponibilidade_id).maybeSingle(),
  ])
  if (t.error || d.error || !t.data?.ativo || !d.data || !d.data.modo_nativo || d.data.fuso !== FUSO_NATIVO || d.data.calcom_schedule_id !== null) return null
  const responsavelId = d.data.responsavel_id ?? t.data.responsavel_id
  if (!responsavelId || (d.data.responsavel_id && t.data.responsavel_id && d.data.responsavel_id !== t.data.responsavel_id)) return null
  const usuario = await db.from("usuarios").select("id").eq("id", responsavelId).eq("ativo", true).maybeSingle()
  if (usuario.error || !usuario.data) return null
  return { tipo: t.data as Config["tipo"], disp: d.data as Config["disp"], responsavelId }
}

async function ocupacao(c: Config, from: string, to: string): Promise<Ocupado[] | null> {
  const db = getSupabaseAdmin()
  if (!db) return null
  const [ag, bl, incompletos] = await Promise.all([
    db.from("reunioes_agendamentos").select("inicio, fim, responsavel_id, tipo_id, provedor, reunioes_tipos(intervalo_min)")
      .in("status", ["solicitada", "confirmada"]).lt("inicio", to)
      .gt("fim", new Date(Date.parse(from) - 240 * 60_000).toISOString()).limit(3000),
    db.from("ws_tarefa_bloqueios").select("duracao_min, ws_tarefas!inner(prazo_em,prazo_hora,responsavel_id,arquivada_em,excluida_em,concluida_em,ws_tarefa_responsaveis(usuario_id))")
      .gte("ws_tarefas.prazo_em", somarDia(dataBR(from), -1)).lte("ws_tarefas.prazo_em", dataBR(to)).limit(1000),
    db.from("reunioes_agendamentos").select("responsavel_id").in("status", ["solicitada", "confirmada"])
      .or("inicio.is.null,fim.is.null").limit(100),
  ])
  if (ag.error || bl.error || incompletos.error || (ag.data?.length ?? 0) >= 3000 ||
      (bl.data?.length ?? 0) >= 1000 || (incompletos.data?.length ?? 0) >= 100 ||
      (incompletos.data ?? []).some(a => !a.responsavel_id || a.responsavel_id === c.responsavelId)) return null
  const ocupados: Ocupado[] = (ag.data ?? []).filter(a => a.tipo_id === c.tipo.id || !a.responsavel_id || a.responsavel_id === c.responsavelId)
    .filter(a => a.inicio && a.fim).map(a => ({ inicio: a.inicio!, fim: a.fim!, tipo_id: a.tipo_id, provedor: a.provedor,
      bloqueia: !a.responsavel_id || a.responsavel_id === c.responsavelId,
      bufferMin: (a.reunioes_tipos as unknown as { intervalo_min?: number } | null)?.intervalo_min ?? 0 }))
  for (const b of bl.data ?? []) {
    const t = b.ws_tarefas as unknown as { prazo_em: string | null; prazo_hora: string | null; responsavel_id: string | null; arquivada_em: string | null; excluida_em: string | null; concluida_em: string | null; ws_tarefa_responsaveis?: { usuario_id: string }[] }
    if (!t?.prazo_em || !t.prazo_hora || t.arquivada_em || t.excluida_em || t.concluida_em ||
      (t.responsavel_id && t.responsavel_id !== c.responsavelId && !t.ws_tarefa_responsaveis?.some(r => r.usuario_id === c.responsavelId))) continue
    const inicio = brParaUtcIso(t.prazo_em, t.prazo_hora.slice(0, 5))
    ocupados.push({ inicio, fim: new Date(Date.parse(inicio) + b.duracao_min * 60_000).toISOString() })
  }
  return ocupados
}

export async function agendaNativa(from: string, days: number, canal: ChaveCanalNativo = "ativo") {
  const c = canal === "ativo" ? await configurarNativo() : await configurarCanal(canal)
  if (!c) return null
  const hoje = dataBR(new Date().toISOString())
  const inicio = from < hoje ? hoje : from
  const fim = somarDia(hoje, c.tipo.horizonte_dias)
  if (inicio >= fim) return { timezone: FUSO_NATIVO, durationMinutes: c.tipo.duracao_min, days: [] }
  const dias = Math.min(days, c.tipo.horizonte_dias, Math.round((Date.parse(fim) - Date.parse(inicio)) / DIA_MS))
  const startUtc = brParaUtcIso(inicio, "00:00")
  const endUtc = brParaUtcIso(somarDia(inicio, dias), "00:00")
  const ocupados = await ocupacao(c, startUtc, endUtc)
  if (!ocupados) return null
  return { timezone: FUSO_NATIVO, durationMinutes: c.tipo.duracao_min,
    days: Array.from({ length: dias }, (_, i) => { const date = somarDia(inicio, i); return { date, slots: slotsDoDia(c, date, ocupados) } }) }
}

export function validarNome(v: unknown): string | null {
  if (typeof v !== "string" || v.length > 120 || /[<>\u0000-\u001f\u007f-\u009f]/u.test(v)) return null
  const nome = v.normalize("NFC").replace(/\s+/g, " ").trim()
  return nome.length >= 2 && (nome.match(/\p{L}/gu)?.length ?? 0) >= 2 && /^[\p{L}\p{M} .'-]+$/u.test(nome) ? nome : null
}
export function validarWhatsapp(v: unknown): string | null {
  if (typeof v !== "string" || v.length > 30 || /[^+()\d\s-]/.test(v)) return null
  let digits = v.replace(/\D/g, "")
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) digits = digits.slice(2)
  if (!/^[1-9][0-9][2-9][0-9]{7,8}$/.test(digits)) return null
  const ddds = new Set([11,12,13,14,15,16,17,18,19,21,22,24,27,28,31,32,33,34,35,37,38,41,42,43,44,45,46,47,48,49,51,53,54,55,61,62,63,64,65,66,67,68,69,71,73,74,75,77,79,81,82,83,84,85,86,87,88,89,91,92,93,94,95,96,97,98,99])
  if (!ddds.has(Number(digits.slice(0, 2))) || !/^(?:[1-9][0-9]9[0-9]{8}|[1-9][0-9][2-5][0-9]{7})$/.test(digits)) return null
  return `+55${digits}`
}
export function validarAtribuicao(v: unknown): Record<string, string> | null {
  if (v === undefined) return {}
  if (!v || typeof v !== "object" || Array.isArray(v)) return null
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) {
    if (!["utm_source", "utm_medium", "utm_campaign", "utm_content"].includes(key) || typeof value !== "string" || value.length > 120 || /[<>\u0000-\u001f\u007f-\u009f]/.test(value)) return null
    out[key] = value.trim()
  }
  return out
}
export function segredoValido(recebido: string | null): boolean {
  const esperado = process.env.ATIVO_WORKSPACE_API_SECRET
  if (!esperado || esperado.length < 32 || !recebido?.startsWith("Bearer ")) return false
  const a = Buffer.from(recebido.slice(7)); const b = Buffer.from(esperado)
  return a.length === b.length && timingSafeEqual(a, b)
}
export function hashRate(valor: string): string { return createHash("sha256").update(`${process.env.ATIVO_WORKSPACE_API_SECRET}:${valor}`).digest("hex") }

export async function limitar(chave: string, limite = 30): Promise<boolean | null> {
  const db = getSupabaseAdmin()
  if (!db) return null
  try {
    const { data, error } = await db.rpc("reunioes_nativas_limitar", { p_chave: hashRate(chave), p_limite: limite })
    return error ? null : data === true
  } catch { return null }
}

export async function reservarNativo(input: { name: string; whatsapp: string; start: string; idempotencyKey: string; attribution: Record<string, string> }) {
  if (!idempotencyKeyValida(input.idempotencyKey)) return { code: "INVALID_INPUT" }
  const c = await configurarNativo()
  if (!c) return { code: "CONFIG_UNAVAILABLE" }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(input.start) || !Number.isFinite(Date.parse(input.start))) return { code: "INVALID_INPUT" }
  const start = new Date(input.start).toISOString()
  const payload = JSON.stringify([input.name, input.whatsapp, start, input.attribution])
  const hash = createHash("sha256").update(payload).digest("hex")
  const db = getSupabaseAdmin()
  if (!db) return { code: "TEMPORARY_FAILURE" }
  const { data, error } = await db.rpc("reunioes_nativas_reservar", {
    p_nome: input.name, p_telefone: input.whatsapp, p_inicio: start, p_chave: input.idempotencyKey,
    p_hash: hash, p_atribuicao: input.attribution,
  })
  if (error) return { code: "TEMPORARY_FAILURE" }
  return data as { code?: string; status?: string; bookingId?: string; startsAt?: string; endsAt?: string; timezone?: string }
}

/** Limite real de bytes, inclusive com Transfer-Encoding: chunked. */
export async function lerJsonNativo(req: Request): Promise<Record<string, unknown>> {
  const reader = req.body?.getReader()
  if (!reader) throw new Error("INVALID_INPUT")
  const chunks: Uint8Array[] = []
  let tamanho = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      tamanho += value.byteLength
      if (tamanho > 4096) { await reader.cancel(); throw new Error("INVALID_INPUT") }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  const bytes = new Uint8Array(tamanho)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes))
}
